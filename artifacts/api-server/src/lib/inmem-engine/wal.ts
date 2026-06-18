import { promises as fsp, createReadStream, createWriteStream, fdatasync as fdatasyncCb, type WriteStream } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import readline from "node:readline";
import type { WalEntry } from "./types";

const fdatasync = promisify(fdatasyncCb);

// Write-Ahead Log: every accepted command and emitted trade is appended,
// in receive order, as a single JSON object per line (JSONL). The engine
// can rebuild the entire book by replaying this file.
//
// Why JSONL on the local filesystem rather than e.g. a real durable WAL
// (RocksDB / sqlite / Kafka)?
//
//   - Local fs is ~µs to append; the engine stays single-threaded with no
//     network dependency on the hot path.
//   - For real production durability you'd swap the writer for an
//     fsync-after-batch loop or stream the same entries to Kafka. The
//     `WalWriter` interface below is small enough that swapping is a
//     localised change.
//   - JSONL replays in O(file_size) and is human-debuggable — you can
//     `tail -f` the WAL during a benchmark and watch every match scroll by.
//
// We keep ONE writer instance (one fd, append mode) per engine instance.
// Concurrent writes from different processes are NOT supported — the
// engine is intentionally single-process / single-threaded.

export interface WalOptions {
  /** When true, every append calls fdatasync(2) before resolving. This
   *  guarantees the entry is on disk before the engine acknowledges the
   *  command — the strongest single-node durability we can offer.
   *  Cost: ~50-200µs per append depending on the disk. Production
   *  exchanges run this on. The benchmark / sandbox path leaves it off
   *  to measure raw matching speed. */
  fsyncOnAppend?: boolean;
}

export class WalWriter {
  private stream: WriteStream | null = null;
  private fd: number | null = null;
  private readonly path: string;
  private opening: Promise<void> | null = null;
  private readonly fsyncOnAppend: boolean;

  constructor(filePath: string, opts: WalOptions = {}) {
    this.path = filePath;
    this.fsyncOnAppend = opts.fsyncOnAppend ?? false;
  }

  private async ensureOpen(): Promise<void> {
    if (this.stream) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      await fsp.mkdir(path.dirname(this.path), { recursive: true });
      // 'a' = append. flags must be a string for createWriteStream.
      this.stream = createWriteStream(this.path, { flags: "a" });
      // Capture the underlying fd so we can fdatasync it directly when
      // fsyncOnAppend is enabled. We wait for 'open' so the descriptor
      // exists before any append fires.
      await new Promise<void>((resolve, reject) => {
        this.stream!.once("open", (fd) => { this.fd = fd; resolve(); });
        this.stream!.once("error", reject);
      });
    })();
    await this.opening;
    this.opening = null;
  }

  /** Append one entry. With `fsyncOnAppend:false` (default) resolves once
   *  the line is in the OS write buffer — fastest path, used by the
   *  benchmark and sandbox. With `fsyncOnAppend:true` the entry is forced
   *  to disk via fdatasync(2) before the promise resolves — the durability
   *  boundary the production engine relies on. */
  async append(entry: WalEntry): Promise<void> {
    await this.ensureOpen();
    const line = JSON.stringify(entry) + "\n";
    await new Promise<void>((resolve, reject) => {
      this.stream!.write(line, (err) => (err ? reject(err) : resolve()));
    });
    if (this.fsyncOnAppend && this.fd !== null) {
      // fdatasync flushes the data (not metadata like mtime). Roughly 2-5×
      // faster than fsync on ext4/xfs and is sufficient for an append-only
      // log because we never depend on metadata accuracy for replay.
      await fdatasync(this.fd);
    }
  }

  /** Truncate the WAL — called after a snapshot rotation so disk usage
   *  doesn't grow unbounded. The snapshot now contains everything the
   *  truncated WAL prefix did, so replays are still complete. */
  async rotate(): Promise<void> {
    if (this.stream) {
      await new Promise<void>((res) => this.stream!.end(() => res()));
      this.stream = null;
      this.fd = null;
    }
    await fsp.writeFile(this.path, "");
  }

  async close(): Promise<void> {
    if (!this.stream) return;
    await new Promise<void>((res) => this.stream!.end(() => res()));
    this.stream = null;
    this.fd = null;
  }

  /** Streaming replay — yields one entry per line, never loads the whole
   *  file into memory so multi-GB WALs replay safely. */
  static async *read(filePath: string): AsyncIterable<WalEntry> {
    try {
      await fsp.access(filePath);
    } catch {
      return; // no WAL yet — nothing to replay
    }
    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const raw of rl) {
      if (!raw) continue;
      try {
        yield JSON.parse(raw) as WalEntry;
      } catch {
        // Corrupt trailing line (typically the very last entry of a
        // crashed write). Stop replay here — anything after a bad line is
        // unsafe to apply since we can't be sure of ordering.
        return;
      }
    }
  }
}
