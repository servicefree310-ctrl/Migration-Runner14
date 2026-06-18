import { promises as fsp } from "node:fs";
import path from "node:path";
import type { Order } from "./types";

// Snapshot file format. Versioned so we can evolve the schema without
// silently misreading old snapshots.
//
// Recovery procedure (see engine.ts startup):
//   1. Load the latest snapshot — gives us the resting book at `seq`.
//   2. Stream-replay the WAL from `seq + 1` onwards.
//   3. Engine resumes serving with `nextSeq = lastReplayedSeq + 1`.

// v1 → original (sandbox) format
// v2 → adds `haltedSymbols` so admin halt state survives a restart
const SNAPSHOT_VERSION = 2 as const;
const SUPPORTED_VERSIONS = new Set<number>([1, 2]);

export interface SnapshotFile {
  version: number;
  /** Last sequence number applied at the moment of snapshot. The WAL after
   *  this seq must be replayed on top to bring the engine fully current. */
  seq: number;
  takenAt: number;
  /** Symbol → list of resting orders (ALL of them, not just top-of-book).
   *  We rebuild the book by iterating in stored order — the snapshot writer
   *  is responsible for emitting them in time-priority order so FIFO is
   *  preserved on recovery. */
  books: Record<string, Order[]>;
  /** Next ids to issue — required so post-recovery ids never collide with
   *  pre-recovery ones, even if the WAL is empty. */
  nextOrderId: number;
  nextTradeId: number;
  /** Symbols currently halted (no new orders accepted). Optional for back-
   *  compat with v1 snapshots written before halt support landed. */
  haltedSymbols?: string[];
}

export class SnapshotStore {
  private readonly path: string;

  constructor(filePath: string) {
    this.path = filePath;
  }

  async save(snap: Omit<SnapshotFile, "version" | "takenAt">): Promise<void> {
    const full: SnapshotFile = {
      version: SNAPSHOT_VERSION,
      takenAt: Date.now(),
      ...snap,
    };
    await fsp.mkdir(path.dirname(this.path), { recursive: true });
    // Write to a temp file then atomic-rename so a crash mid-write never
    // leaves a half-readable snapshot. fsp.rename is atomic on the same fs.
    const tmp = this.path + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(full));
    await fsp.rename(tmp, this.path);
  }

  async load(): Promise<SnapshotFile | null> {
    try {
      const buf = await fsp.readFile(this.path, "utf8");
      const parsed = JSON.parse(buf) as SnapshotFile;
      if (!SUPPORTED_VERSIONS.has(parsed.version)) {
        // Unknown version — refuse to load rather than half-applying an
        // incompatible schema. Operator should run a migration script.
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
