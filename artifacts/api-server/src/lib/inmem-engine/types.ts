// Pure data types for the in-memory matching engine. Kept dependency-free
// so the engine can run inside a worker thread, the main process, a CLI
// benchmark, or a test harness without dragging in Express / Drizzle.

export type Side = "buy" | "sell";

/** All five order types real exchanges support.
 *  - limit       — rest at given price; match anything that crosses
 *  - market      — sweep best opposite levels at any price; never rests
 *  - ioc         — Immediate-Or-Cancel: match what you can, drop the rest
 *  - fok         — Fill-Or-Kill: match in full or do nothing (no partials)
 *  - post_only   — Maker-only: must rest in the book; reject if it would cross
 */
export type OrderType = "limit" | "market" | "ioc" | "fok" | "post_only";

/** Self-Trade Prevention modes — what to do when a taker would match its
 *  own resting maker (same userId).
 *   - none           — allow self-trade (sandbox / testing)
 *   - cancel_newest  — cancel the incoming taker (rest of taker dropped)
 *   - cancel_oldest  — cancel the resting maker, continue matching taker
 *   - cancel_both    — cancel both sides
 */
export type STPMode = "none" | "cancel_newest" | "cancel_oldest" | "cancel_both";

/** Public, immutable view of an order. The engine internally wraps this in
 *  a doubly-linked list node — see `pricelevel.ts`. */
export interface Order {
  /** Engine-local 64-bit-safe sequential id. Distinct from the SQL row id
   *  used by the production engine so the two systems can coexist. */
  id: number;
  symbol: string;
  side: Side;
  type: OrderType;
  /** Limit price in QUOTE currency, full precision (no scaling).
   *  For MARKET orders this is set to `0` and the engine treats it as
   *  "any price" (subject to a slippage cap configured at the call site). */
  price: number;
  /** Original order quantity in BASE currency. */
  quantity: number;
  /** Quantity still resting in the book. Engine mutates this in place. */
  remaining: number;
  /** Wall-clock at acceptance. Used only for analytics — FIFO order is
   *  enforced by linked-list insertion order, NOT by comparing timestamps,
   *  so two orders accepted in the same millisecond still match correctly. */
  timestamp: number;
  /** Optional opaque handle the caller can attach (e.g. SQL order id) so
   *  trade events can be reconciled back to the persistence layer. */
  ref?: string;
  /** Owner — required for Self-Trade Prevention. The sandbox path passes 0
   *  (and STP defaults to "none") so behaviour is unchanged. */
  userId?: number;
  /** Caller-supplied STP policy for this specific order. Defaults to "none". */
  stp?: STPMode;
}

export interface Trade {
  /** Engine-local sequential trade id. */
  id: number;
  symbol: string;
  /** Price the trade executed at — always the MAKER's price (price-time
   *  priority means the resting order sets the price). */
  price: number;
  quantity: number;
  /** Side of the AGGRESSOR (taker). The maker is always the opposite side. */
  takerSide: Side;
  makerOrderId: number;
  takerOrderId: number;
  /** Optional refs mirrored from the orders, for downstream reconciliation. */
  makerRef?: string;
  takerRef?: string;
  /** Owner ids, mirrored from the orders, so the settlement layer doesn't
   *  need a second lookup. */
  makerUserId?: number;
  takerUserId?: number;
  timestamp: number;
}

/** Reasons the engine may reject or short-circuit a placement. Used in the
 *  result so the caller can present a precise error. */
export type RejectReason =
  | "post_only_would_cross"
  | "fok_insufficient_liquidity"
  | "stp_self_match"
  | "symbol_halted";

/** Engine commands — go through the single-threaded event queue. */
export type Command =
  | { kind: "place"; order: Order }
  | { kind: "cancel"; symbol: string; orderId: number };

/** Cancellation event emitted when the engine drops an order on its own
 *  (STP, IOC remainder, FOK rejection). The settlement layer listens for
 *  these so it can refund any locked funds. */
export interface AutoCancelEvent {
  orderId: number;
  symbol: string;
  reason: RejectReason | "ioc_remainder";
  /** Quantity that was NOT filled — exactly what the settler must refund. */
  unfilled: number;
  /** Optional ref carried from the original order. */
  ref?: string;
  userId?: number;
}

/** WAL entries — every accepted command and every emitted trade is logged
 *  in receive order so the book can be deterministically reconstructed.
 *  We also log halt/resume events so the halted-set survives a restart. */
export type WalEntry =
  | { seq: number; t: number; type: "place"; order: Order }
  | { seq: number; t: number; type: "cancel"; symbol: string; orderId: number }
  | { seq: number; t: number; type: "trade"; trade: Trade }
  | { seq: number; t: number; type: "halt"; symbol: string }
  | { seq: number; t: number; type: "resume"; symbol: string };

export interface DepthLevel {
  price: number;
  quantity: number;
  /** Number of resting orders aggregated at this price. */
  orders: number;
}

export interface Depth {
  symbol: string;
  bids: DepthLevel[]; // sorted descending
  asks: DepthLevel[]; // sorted ascending
  /** Sequence number of the last applied command — clients can use this for
   *  delta-stream resumption (not yet wired up). */
  seq: number;
  /** True if matching is currently halted on this symbol. */
  halted?: boolean;
}
