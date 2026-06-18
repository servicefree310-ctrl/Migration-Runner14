import { PriceLevel, type OrderNode } from "./pricelevel";
import type { Order, Side, Trade, Depth, DepthLevel, AutoCancelEvent, RejectReason, STPMode } from "./types";

// Per-symbol order book.
//
// Data structures (see types.ts comments for the spec):
//
//   bids: Map<price, PriceLevel>   +  bidPrices: number[] sorted ascending
//   asks: Map<price, PriceLevel>   +  askPrices: number[] sorted ascending
//
// Why a sorted array instead of a balanced BST (BTreeMap)?
//   - JS has no built-in BTreeMap. A typical order book has O(100-1000)
//     active price levels; binary search + array splice is O(log n) lookup
//     and O(n) splice — for a 1k-level book that's ~1µs in V8.
//   - This is the same trade-off LMAX Disruptor and most JVM engines make
//     — they use sorted arrays + ring buffers, NOT trees.
//   - If you ever need to support 10k+ price levels per symbol (e.g. a
//     fragmented MM market), swap this for a skiplist or std::map FFI
//     binding without touching the matching loop — the public surface
//     `bestBid()`, `bestAsk()`, `addLevel()`, `dropLevel()` is the only
//     thing the matching loop knows about.
//
// We keep `bidPrices` ascending (NOT descending) and use the LAST element
// as the best bid. Reason: array.pop() is O(1) but array.shift() is O(n),
// so by storing bids ascending we get O(1) best-bid removal too.

export interface MatchResult {
  trades: Trade[];
  /** True if any qty rested in the book (i.e. order is not fully filled). */
  resting: boolean;
  /** True if the order was rejected outright (post_only crossed, fok could
   *  not fill, stp triggered cancel_newest). The `rejectReason` explains. */
  rejected: boolean;
  rejectReason?: RejectReason;
  /** Auto-cancellations the matcher performed on its own (STP cancels of
   *  resting makers, etc.). The engine emits one event per entry so the
   *  settlement layer can refund locked balances. */
  autoCancels: AutoCancelEvent[];
}

export class OrderBook {
  readonly symbol: string;

  private readonly bids = new Map<number, PriceLevel>();
  private readonly asks = new Map<number, PriceLevel>();

  /** Sorted ascending. bestBid = bidPrices[bidPrices.length-1]. */
  private readonly bidPrices: number[] = [];
  /** Sorted ascending. bestAsk = askPrices[0]. */
  private readonly askPrices: number[] = [];

  /** order id → (level, node) so cancels are O(log n) lookup + O(1) unlink. */
  private readonly orderIndex = new Map<number, { level: PriceLevel; node: OrderNode; side: Side }>();

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  /** Apply an aggressive (taker) order. Handles all five order types
   *  (limit / market / ioc / fok / post_only) plus self-trade prevention.
   *
   *  This is the HOT PATH for limit orders — every line is benchmarked.
   *  The branchy preludes for FOK / post_only run BEFORE the inner loop so
   *  the limit-order path is unchanged.
   */
  match(taker: Order, nextTradeId: () => number): MatchResult {
    const trades: Trade[] = [];
    const autoCancels: AutoCancelEvent[] = [];
    const isBuyer = taker.side === "buy";
    const stp: STPMode = taker.stp ?? "none";

    // ── post_only: must NOT cross. Reject if it would. ───────────────────
    if (taker.type === "post_only" && this.wouldCross(taker)) {
      return { trades, resting: false, rejected: true, rejectReason: "post_only_would_cross", autoCancels };
    }

    // ── fok: must fill in FULL or do nothing. Pre-walk the book to check
    //    available liquidity at acceptable prices BEFORE mutating anything. ─
    if (taker.type === "fok" && !this.canFullyFill(taker)) {
      return { trades, resting: false, rejected: true, rejectReason: "fok_insufficient_liquidity", autoCancels };
    }

    const bookPrices = isBuyer ? this.askPrices : this.bidPrices;
    const bookLevels = isBuyer ? this.asks : this.bids;
    const isMarket = taker.type === "market";

    while (taker.remaining > 0 && bookPrices.length > 0) {
      // Best price = first ask (ascending) or last bid (ascending).
      const bestPrice = isBuyer ? bookPrices[0]! : bookPrices[bookPrices.length - 1]!;

      // Cross check — skip for market (any price is acceptable).
      if (!isMarket) {
        if (isBuyer ? taker.price < bestPrice : taker.price > bestPrice) break;
      }

      const level = bookLevels.get(bestPrice)!;

      // Drain the FIFO at this level. Each iteration peels one maker.
      while (taker.remaining > 0 && level.head) {
        const makerNode = level.head;
        const maker = makerNode.order;

        // ── STP: if same owner and not 'none', resolve per the policy. ───
        if (stp !== "none" && maker.userId !== undefined && maker.userId === taker.userId) {
          if (stp === "cancel_oldest" || stp === "cancel_both") {
            // Drop the resting maker. It refunds via autoCancel event.
            level.unlink(makerNode);
            this.orderIndex.delete(maker.id);
            autoCancels.push({
              orderId: maker.id,
              symbol: this.symbol,
              reason: "stp_self_match",
              unfilled: maker.remaining,
              ...(maker.ref !== undefined ? { ref: maker.ref } : {}),
              ...(maker.userId !== undefined ? { userId: maker.userId } : {}),
            });
            if (stp === "cancel_both") {
              // Don't keep matching — cancel the taker too.
              if (level.isEmpty()) this.dropLevel(bestPrice, isBuyer ? "ask" : "bid");
              return {
                trades, resting: false, rejected: true, rejectReason: "stp_self_match",
                autoCancels,
              };
            }
            // cancel_oldest → continue inner loop, the next maker is
            // makerNode.next (now level.head after unlink).
            continue;
          }
          // cancel_newest — bail out completely.
          if (level.isEmpty()) this.dropLevel(bestPrice, isBuyer ? "ask" : "bid");
          return {
            trades, resting: false, rejected: true, rejectReason: "stp_self_match",
            autoCancels,
          };
        }

        const fillQty = taker.remaining < maker.remaining ? taker.remaining : maker.remaining;

        trades.push({
          id: nextTradeId(),
          symbol: this.symbol,
          price: maker.price, // maker sets the price (price-time priority)
          quantity: fillQty,
          takerSide: taker.side,
          makerOrderId: maker.id,
          takerOrderId: taker.id,
          ...(maker.ref !== undefined ? { makerRef: maker.ref } : {}),
          ...(taker.ref !== undefined ? { takerRef: taker.ref } : {}),
          ...(maker.userId !== undefined ? { makerUserId: maker.userId } : {}),
          ...(taker.userId !== undefined ? { takerUserId: taker.userId } : {}),
          timestamp: Date.now(),
        });

        taker.remaining -= fillQty;
        maker.remaining -= fillQty;
        level.decreaseTotal(fillQty);

        if (maker.remaining === 0) {
          level.unlink(makerNode);
          this.orderIndex.delete(maker.id);
        }
      }

      if (level.isEmpty()) this.dropLevel(bestPrice, isBuyer ? "ask" : "bid");
    }

    // After matching: decide what to do with any remainder.
    let resting = false;
    if (taker.remaining > 0) {
      if (taker.type === "limit" || taker.type === "post_only") {
        this.rest(taker);
        resting = true;
      } else if (taker.type === "ioc") {
        // Caller refunds any unfilled portion via the autoCancel event.
        autoCancels.push({
          orderId: taker.id,
          symbol: this.symbol,
          reason: "ioc_remainder",
          unfilled: taker.remaining,
          ...(taker.ref !== undefined ? { ref: taker.ref } : {}),
          ...(taker.userId !== undefined ? { userId: taker.userId } : {}),
        });
      }
      // market / fok: no remainder is ever added to the book. fok with
      // remaining > 0 here is impossible (we checked canFullyFill upfront)
      // but if it ever happens, drop silently — caller refunds via the
      // settlement layer's "unfilled at end of place" check.
    }
    return { trades, resting, rejected: false, autoCancels };
  }

  /** Place a non-aggressive (post-only style) order directly into the book
   *  without attempting to match. Used by the WAL replayer to rebuild state
   *  exactly as it was — replays must NOT re-execute trades. */
  insertResting(order: Order): void {
    this.rest(order);
  }

  /** Cancel a resting order by engine-local id. Returns the now-cancelled
   *  order (or null if not found / already filled). */
  cancel(orderId: number): Order | null {
    const idx = this.orderIndex.get(orderId);
    if (!idx) return null;
    const { level, node, side } = idx;
    level.unlink(node);
    this.orderIndex.delete(orderId);
    if (level.isEmpty()) this.dropLevel(level.price, side === "buy" ? "bid" : "ask");
    return node.order;
  }

  /** Snapshot the top-N levels — used both by the public depth API and by
   *  the snapshot persistence layer (which passes Infinity to dump it all).
   */
  depth(maxLevels: number, seq: number): Depth {
    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];
    // Bids: walk from the END of the ascending array → descending output.
    for (let i = this.bidPrices.length - 1, n = 0; i >= 0 && n < maxLevels; i--, n++) {
      const p = this.bidPrices[i]!;
      const lvl = this.bids.get(p)!;
      bids.push({ price: p, quantity: lvl.totalQty, orders: lvl.count });
    }
    for (let i = 0, n = 0; i < this.askPrices.length && n < maxLevels; i++, n++) {
      const p = this.askPrices[i]!;
      const lvl = this.asks.get(p)!;
      asks.push({ price: p, quantity: lvl.totalQty, orders: lvl.count });
    }
    return { symbol: this.symbol, bids, asks, seq };
  }

  /** Walk every resting order — used by the snapshot writer. Returns a
   *  fresh array so callers can serialize without holding the engine. */
  allRestingOrders(): Order[] {
    const out: Order[] = [];
    for (const lvl of this.bids.values()) {
      for (let n = lvl.head; n; n = n.next) out.push(n.order);
    }
    for (const lvl of this.asks.values()) {
      for (let n = lvl.head; n; n = n.next) out.push(n.order);
    }
    return out;
  }

  bestBid(): number | null {
    return this.bidPrices.length ? this.bidPrices[this.bidPrices.length - 1]! : null;
  }

  bestAsk(): number | null {
    return this.askPrices.length ? this.askPrices[0]! : null;
  }

  // ─── private helpers ───────────────────────────────────────────────────

  /** True if this order would immediately match the top of the book at the
   *  caller's price. Used by post_only to reject crossing orders BEFORE
   *  we mutate any state. */
  private wouldCross(taker: Order): boolean {
    if (taker.side === "buy") {
      const ask = this.bestAsk();
      return ask !== null && taker.price >= ask;
    }
    const bid = this.bestBid();
    return bid !== null && taker.price <= bid;
  }

  /** Walk the opposite side (without mutating) and check whether enough
   *  qty exists at acceptable prices to satisfy the taker in full. Used
   *  exclusively by FOK; never called on the limit hot path. */
  private canFullyFill(taker: Order): boolean {
    let needed = taker.remaining;
    if (taker.side === "buy") {
      // Asks ascending: walk until price > taker.price or qty satisfied.
      for (let i = 0; i < this.askPrices.length; i++) {
        const p = this.askPrices[i]!;
        if (taker.type !== "market" && p > taker.price) return false;
        const lvl = this.asks.get(p)!;
        // Discount any same-userId resting qty when STP is configured to
        // skip them (cancel_newest would bail out before filling, so for
        // FOK semantics we treat self-matches as unavailable liquidity).
        const usable = this.usableQtyAtLevel(lvl, taker);
        needed -= usable;
        if (needed <= 0) return true;
      }
    } else {
      // Bids ascending: walk from the END (best bid first).
      for (let i = this.bidPrices.length - 1; i >= 0; i--) {
        const p = this.bidPrices[i]!;
        if (taker.type !== "market" && p < taker.price) return false;
        const lvl = this.bids.get(p)!;
        const usable = this.usableQtyAtLevel(lvl, taker);
        needed -= usable;
        if (needed <= 0) return true;
      }
    }
    return false;
  }

  /** Sum of resting quantity at this level that the given taker is allowed
   *  to consume given its STP policy. */
  private usableQtyAtLevel(lvl: PriceLevel, taker: Order): number {
    if (!taker.userId || !taker.stp || taker.stp === "none") return lvl.totalQty;
    let sum = 0;
    for (let n = lvl.head; n; n = n.next) {
      if (n.order.userId !== taker.userId) sum += n.order.remaining;
    }
    return sum;
  }

  private rest(order: Order): void {
    const isBuyer = order.side === "buy";
    const map = isBuyer ? this.bids : this.asks;
    const prices = isBuyer ? this.bidPrices : this.askPrices;
    let level = map.get(order.price);
    if (!level) {
      level = new PriceLevel(order.price);
      map.set(order.price, level);
      // Binary insert — keeps the array sorted ascending so best-price
      // lookup is O(1) and depth snapshots are a single linear walk.
      const ix = lowerBound(prices, order.price);
      prices.splice(ix, 0, order.price);
    }
    const node = level.push(order);
    this.orderIndex.set(order.id, { level, node, side: order.side });
  }

  private dropLevel(price: number, side: "bid" | "ask"): void {
    const map = side === "bid" ? this.bids : this.asks;
    const prices = side === "bid" ? this.bidPrices : this.askPrices;
    map.delete(price);
    const ix = lowerBound(prices, price);
    if (ix < prices.length && prices[ix] === price) prices.splice(ix, 1);
  }
}

/** Standard lower-bound binary search — returns the FIRST index where
 *  arr[i] >= target. Used for both insert position and removal lookup. */
function lowerBound(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
