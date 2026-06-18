import { EventEmitter } from "node:events";
import path from "node:path";
import { OrderBook } from "./orderbook";
import { WalWriter } from "./wal";
import { SnapshotStore, type SnapshotFile } from "./snapshot";
import type { Order, OrderType, STPMode, Side, Trade, Depth, Command, AutoCancelEvent, RejectReason } from "./types";

// ─── Public-facing engine API ────────────────────────────────────────────
//
// Single-threaded matching core, exactly as specced:
//
//   placeOrder() / cancelOrder() do NOT match inline. They push a command
//   into a FIFO queue, and a single processing loop drains commands one at
//   a time. This guarantees:
//
//     - No race conditions: the book is only ever read/mutated from one
//       call site.
//     - Deterministic replay: the WAL is the same sequence the engine
//       processed, so `replay(WAL)` produces a bit-identical book.
//     - Easy back-pressure: callers see the queue depth via metrics()
//       and can throttle if they ever swamp it.
//
// We use Node's microtask queue (`queueMicrotask`) instead of a polling
// setImmediate loop because:
//   - microtasks run BEFORE I/O callbacks → place-order latency stays
//     deterministic even under load
//   - no idle CPU spin when the queue is empty
//   - one queueMicrotask per drained command keeps the call stack flat
//     so V8 doesn't deopt the matching function under deep recursion.
//
// Snapshot strategy:
//   - Every `snapshotEveryNCommands` commands (default 5_000) the engine
//     dumps the full book to disk and rotates the WAL.
//   - On startup we load the latest snapshot and replay the WAL tail —
//     identical to PostgreSQL / RocksDB checkpoint+WAL recovery.

export interface EngineOptions {
  /** Where to write the WAL + snapshots. Defaults to /tmp/cryptox-inmem. */
  dataDir?: string;
  /** Snapshot rotation cadence. 0 disables auto-snapshotting (tests). */
  snapshotEveryNCommands?: number;
  /** Disable WAL writes entirely — used by the benchmark to measure raw
   *  matching speed without filesystem syscalls in the hot loop. */
  disablePersistence?: boolean;
  /** When true, every WAL append is fdatasync'd before the engine
   *  acknowledges the command. Production engine sets this; sandbox /
   *  benchmark leaves it off. Adds ~50-200µs per command. */
  fsyncWal?: boolean;
}

export interface EngineMetrics {
  totalCommands: number;
  totalTrades: number;
  queueDepth: number;
  lastMatchLatencyUs: number;
  /** Rolling EMA of per-match latency (microseconds). */
  avgMatchLatencyUs: number;
  symbolsTracked: number;
  haltedSymbols: string[];
  /** Last sequence number applied — useful for the settlement layer to
   *  reason about the "committed cursor" vs the "settled cursor". */
  seq: number;
}

export interface PlaceOrderInput {
  symbol: string;
  side: Side;
  /** Limit price in QUOTE currency. For MARKET orders pass 0. */
  price: number;
  /** Order size in BASE currency. */
  quantity: number;
  /** Order type. Defaults to "limit" for backward compatibility with the
   *  original sandbox API. */
  type?: OrderType;
  /** Self-trade prevention policy. Defaults to "none". */
  stp?: STPMode;
  /** Owner — required for STP and for the production settlement layer to
   *  know whose wallet to debit/credit. The sandbox path leaves it
   *  undefined and accepts the resulting STP=none semantics. */
  userId?: number;
  /** Optional opaque tag (e.g. SQL row id) the engine threads through into
   *  every emitted Trade for downstream reconciliation. */
  ref?: string;
}

export interface PlaceOrderResult {
  orderId: number;
  trades: Trade[];
  /** True if any qty rested in the book (i.e. order is not fully filled). */
  resting: boolean;
  /** True if the order was rejected outright (post_only would cross, FOK
   *  could not fully fill, STP triggered cancel_newest). The settlement
   *  layer must refund any locked balance for the FULL original quantity. */
  rejected: boolean;
  rejectReason?: RejectReason;
  /** Auto-cancellations the engine performed on its own — STP-induced maker
   *  cancels, IOC remainder, etc. The settlement layer iterates this and
   *  refunds the unfilled qty for each. */
  autoCancels: AutoCancelEvent[];
}

export class InMemoryEngine {
  private readonly opts: Required<EngineOptions>;
  private readonly books = new Map<string, OrderBook>();
  /** Set of symbols where the engine refuses new placements. Cancels are
   *  still processed (so users can withdraw orders during a halt). */
  private readonly halted = new Set<string>();

  private nextOrderId = 1;
  private nextTradeId = 1;
  private seq = 0;

  private readonly queue: Array<{
    cmd: Command;
    resolve: (r: PlaceOrderResult | { cancelled: Order | null }) => void;
    reject: (e: Error) => void;
  }> = [];
  private draining = false;

  private wal: WalWriter | null = null;
  private snapshotStore: SnapshotStore | null = null;
  private commandsSinceSnapshot = 0;
  private snapshotInFlight: Promise<void> | null = null;

  // Metrics — kept as primitives to avoid GC pressure in tight loops.
  private totalCommands = 0;
  private totalTrades = 0;
  private lastMatchUs = 0;
  private avgMatchUs = 0;

  /** Emits two kinds of events:
   *    'trade'     → Trade — for the settlement worker
   *    'autoCancel'→ AutoCancelEvent — for the refund worker
   *  Listeners must be attached BEFORE the engine processes any command
   *  to avoid missing events. */
  readonly events = new EventEmitter();

  constructor(opts: EngineOptions = {}) {
    this.opts = {
      dataDir: opts.dataDir ?? "/tmp/cryptox-inmem",
      snapshotEveryNCommands: opts.snapshotEveryNCommands ?? 5_000,
      disablePersistence: opts.disablePersistence ?? false,
      fsyncWal: opts.fsyncWal ?? false,
    };
    if (!this.opts.disablePersistence) {
      this.wal = new WalWriter(
        path.join(this.opts.dataDir, "engine.wal.jsonl"),
        { fsyncOnAppend: this.opts.fsyncWal },
      );
      this.snapshotStore = new SnapshotStore(path.join(this.opts.dataDir, "engine.snapshot.json"));
    }
  }

  // ─── Recovery ──────────────────────────────────────────────────────────
  // Must be called BEFORE the engine accepts any commands. Loads the
  // snapshot, replays the WAL tail, and leaves the engine ready to serve.

  async recover(): Promise<{ replayedEntries: number; loadedSnapshotSeq: number }> {
    if (this.opts.disablePersistence) return { replayedEntries: 0, loadedSnapshotSeq: 0 };

    let loadedSnapshotSeq = 0;
    if (this.snapshotStore) {
      const snap = await this.snapshotStore.load();
      if (snap) {
        this.applySnapshot(snap);
        loadedSnapshotSeq = snap.seq;
      }
    }

    let replayed = 0;
    if (this.wal) {
      for await (const entry of WalWriter.read(path.join(this.opts.dataDir, "engine.wal.jsonl"))) {
        if (entry.seq <= this.seq) continue; // already in snapshot
        this.applyWalEntry(entry);
        replayed++;
      }
    }
    return { replayedEntries: replayed, loadedSnapshotSeq };
  }

  // ─── Public API ────────────────────────────────────────────────────────

  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const orderType: OrderType = input.type ?? "limit";
    const order: Order = {
      id: this.nextOrderId++,
      symbol: input.symbol,
      side: input.side,
      type: orderType,
      // For market orders the caller passes 0 (or any value); we store it
      // as a sentinel so the WAL replay is bit-identical. The matching
      // loop ignores price entirely for market orders.
      price: input.price,
      quantity: input.quantity,
      remaining: input.quantity,
      timestamp: Date.now(),
      ...(input.ref !== undefined ? { ref: input.ref } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.stp !== undefined ? { stp: input.stp } : {}),
    };
    return this.enqueue({ kind: "place", order }) as Promise<PlaceOrderResult>;
  }

  cancelOrder(symbol: string, orderId: number): Promise<{ cancelled: Order | null }> {
    return this.enqueue({ kind: "cancel", symbol, orderId }) as Promise<{ cancelled: Order | null }>;
  }

  getOrderbook(symbol: string, maxLevels = 20): Depth {
    const book = this.books.get(symbol);
    const halted = this.halted.has(symbol);
    if (!book) return { symbol, bids: [], asks: [], seq: this.seq, halted };
    const d = book.depth(maxLevels, this.seq);
    if (halted) d.halted = true;
    return d;
  }

  /** Snapshot every resting order across every book. Used by callers
   *  (e.g. ProdEngine) that need to rebuild their own ref→engineId
   *  index after recovery. Read-only — does not mutate state. */
  allRestingOrdersBySymbol(): Map<string, Order[]> {
    const out = new Map<string, Order[]>();
    for (const [sym, b] of this.books) out.set(sym, b.allRestingOrders());
    return out;
  }

  metrics(): EngineMetrics {
    return {
      totalCommands: this.totalCommands,
      totalTrades: this.totalTrades,
      queueDepth: this.queue.length,
      lastMatchLatencyUs: Math.round(this.lastMatchUs),
      avgMatchLatencyUs: Math.round(this.avgMatchUs),
      symbolsTracked: this.books.size,
      haltedSymbols: Array.from(this.halted),
      seq: this.seq,
    };
  }

  /** Halt new placements on a symbol. Cancels still flow. The set is
   *  WAL-logged so it survives a restart. */
  async haltSymbol(symbol: string): Promise<void> {
    if (this.halted.has(symbol)) return;
    this.halted.add(symbol);
    if (this.wal) {
      this.seq++;
      await this.wal.append({ seq: this.seq, t: Date.now(), type: "halt", symbol });
    }
  }

  async resumeSymbol(symbol: string): Promise<void> {
    if (!this.halted.has(symbol)) return;
    this.halted.delete(symbol);
    if (this.wal) {
      this.seq++;
      await this.wal.append({ seq: this.seq, t: Date.now(), type: "resume", symbol });
    }
  }

  isHalted(symbol: string): boolean {
    return this.halted.has(symbol);
  }

  /** Force a snapshot now. Returns once the file is fsynced and the WAL
   *  rotated. Tests use this to deterministically test recovery. */
  async snapshotNow(): Promise<void> {
    if (this.opts.disablePersistence || !this.snapshotStore || !this.wal) return;
    if (this.snapshotInFlight) return this.snapshotInFlight;
    this.snapshotInFlight = (async () => {
      const books: Record<string, Order[]> = {};
      for (const [sym, b] of this.books) books[sym] = b.allRestingOrders();
      await this.snapshotStore!.save({
        seq: this.seq,
        books,
        nextOrderId: this.nextOrderId,
        nextTradeId: this.nextTradeId,
        haltedSymbols: Array.from(this.halted),
      });
      await this.wal!.rotate();
      this.commandsSinceSnapshot = 0;
    })();
    try {
      await this.snapshotInFlight;
    } finally {
      this.snapshotInFlight = null;
    }
  }

  async shutdown(): Promise<void> {
    // Drain the queue before closing — accepted commands must finish.
    while (this.queue.length || this.draining) {
      await new Promise((r) => setImmediate(r));
    }
    await this.wal?.close();
  }

  // ─── Queue + drain loop (the SINGLE matching site) ─────────────────────

  private enqueue(cmd: Command): Promise<PlaceOrderResult | { cancelled: Order | null }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      if (!this.draining) this.scheduleDrain();
    });
  }

  private scheduleDrain(): void {
    this.draining = true;
    queueMicrotask(() => void this.drain());
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        try {
          const result = await this.process(item.cmd);
          item.resolve(result);
        } catch (e) {
          item.reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(cmd: Command): Promise<PlaceOrderResult | { cancelled: Order | null }> {
    this.totalCommands++;
    this.commandsSinceSnapshot++;
    this.seq++;

    if (cmd.kind === "place") {
      // Halt check happens inside the queue (not at enqueue) so admin
      // halts are observed in WAL-deterministic order with respect to
      // concurrent placements that landed in the queue first.
      if (this.halted.has(cmd.order.symbol)) {
        return {
          orderId: cmd.order.id,
          trades: [],
          resting: false,
          rejected: true,
          rejectReason: "symbol_halted",
          autoCancels: [],
        };
      }

      // Capture the AS-PLACED snapshot of the order BEFORE match() mutates
      // `remaining`. The WAL must record the order in its untouched state
      // so deterministic replay starts matching from the same `remaining`
      // the live engine started from. Logging post-match state would
      // leave fully-filled takers as `remaining: 0` in the WAL, and
      // replay would skip matching them — the book would then carry
      // ghost makers forever.
      const orderForWal: Order = { ...cmd.order };

      const tStart = nowUs();
      const book = this.bookFor(cmd.order.symbol);
      const result = book.match(cmd.order, () => this.nextTradeId++);
      const tEnd = nowUs();
      this.lastMatchUs = tEnd - tStart;
      // EWMA with alpha=0.05 — enough smoothing to filter GC spikes but
      // still react within a few hundred commands to a real regression.
      this.avgMatchUs = this.avgMatchUs === 0
        ? this.lastMatchUs
        : this.avgMatchUs * 0.95 + this.lastMatchUs * 0.05;
      this.totalTrades += result.trades.length;

      // Persist the COMMAND first so a replay reproduces the same trades.
      // Then persist each trade (or you could reconstruct trades from
      // command replay — but storing trades makes downstream reconciliation
      // cheaper since the settlement layer doesn't need to re-run match).
      if (this.wal) {
        await this.wal.append({ seq: this.seq, t: Date.now(), type: "place", order: orderForWal });
        for (const trade of result.trades) {
          await this.wal.append({ seq: this.seq, t: Date.now(), type: "trade", trade });
        }
      }

      for (const t of result.trades) this.events.emit("trade", t);
      for (const c of result.autoCancels) this.events.emit("autoCancel", c);

      this.maybeSnapshot();
      const ret: PlaceOrderResult = {
        orderId: cmd.order.id,
        trades: result.trades,
        resting: result.resting,
        rejected: result.rejected,
        autoCancels: result.autoCancels,
      };
      if (result.rejectReason !== undefined) ret.rejectReason = result.rejectReason;
      return ret;
    }

    // cancel
    const book = this.books.get(cmd.symbol);
    const cancelled = book ? book.cancel(cmd.orderId) : null;
    if (this.wal) {
      await this.wal.append({
        seq: this.seq, t: Date.now(), type: "cancel",
        symbol: cmd.symbol, orderId: cmd.orderId,
      });
    }
    this.maybeSnapshot();
    return { cancelled };
  }

  private maybeSnapshot(): void {
    if (this.opts.disablePersistence) return;
    if (this.opts.snapshotEveryNCommands <= 0) return;
    if (this.commandsSinceSnapshot < this.opts.snapshotEveryNCommands) return;
    if (this.snapshotInFlight) return;
    // Fire-and-forget — snapshot runs concurrently with subsequent commands.
    // The snapshotter only reads from the books (not mutating), and since
    // we're single-threaded the read happens at the moment the microtask
    // runs which is after the current command but before the next, so the
    // snapshot is consistent at `this.seq`.
    void this.snapshotNow();
  }

  private bookFor(symbol: string): OrderBook {
    let b = this.books.get(symbol);
    if (!b) {
      b = new OrderBook(symbol);
      this.books.set(symbol, b);
    }
    return b;
  }

  // ─── Recovery helpers ──────────────────────────────────────────────────

  private applySnapshot(snap: SnapshotFile): void {
    this.seq = snap.seq;
    this.nextOrderId = snap.nextOrderId;
    this.nextTradeId = snap.nextTradeId;
    for (const [sym, orders] of Object.entries(snap.books)) {
      const book = this.bookFor(sym);
      for (const o of orders) book.insertResting({ ...o });
    }
    if (snap.haltedSymbols) {
      for (const s of snap.haltedSymbols) this.halted.add(s);
    }
  }

  private applyWalEntry(entry: { seq: number } & (
    | { type: "place"; order: Order }
    | { type: "cancel"; symbol: string; orderId: number }
    | { type: "trade"; trade: Trade }
    | { type: "halt"; symbol: string }
    | { type: "resume"; symbol: string }
  )): void {
    this.seq = entry.seq;
    if (entry.type === "place") {
      // Re-execute matching deterministically. Any trades emitted now will
      // exactly equal the trades that were emitted (and logged) the first
      // time, because the book state at this seq is identical.
      const book = this.bookFor(entry.order.symbol);
      const order: Order = { ...entry.order, remaining: entry.order.remaining };
      book.match(order, () => this.nextTradeId++);
      if (entry.order.id >= this.nextOrderId) this.nextOrderId = entry.order.id + 1;
    } else if (entry.type === "cancel") {
      const book = this.books.get(entry.symbol);
      book?.cancel(entry.orderId);
    } else if (entry.type === "halt") {
      this.halted.add(entry.symbol);
    } else if (entry.type === "resume") {
      this.halted.delete(entry.symbol);
    }
    // 'trade' entries are derivable from 'place' replays — we skip them on
    // recovery to avoid double-counting metrics. They're kept in the WAL
    // purely so the settlement layer can reconcile without re-matching.
  }
}

/** Microsecond-resolution wall clock — process.hrtime.bigint is the only
 *  clock with sub-ms accuracy in Node. We convert to a plain number since
 *  all our latencies fit comfortably in a 53-bit float. */
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1_000;
}
