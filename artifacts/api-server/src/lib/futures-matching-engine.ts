/**
 * futures-matching-engine.ts
 *
 * Redis-based futures order book matching engine.
 * Replaces the Go service — runs entirely inside the Node.js process.
 *
 * Order book layout in Redis:
 *   fut:ob:{pairId}:buy          sorted set  score=-price  (highest bid → lowest score index 0)
 *   fut:ob:{pairId}:sell         sorted set  score=+price  (lowest ask  → lowest score index 0)
 *   fut:ob:{pairId}:ord:{id}     string      JSON BookOrder (TTL 24h)
 *
 * Concurrency:
 *   Node.js is single-threaded, but async/await creates interleave points.
 *   A per-pair async mutex serialises all order-book mutations for a pair so
 *   two concurrent placements never double-fill the same maker order.
 *
 * After every book change a depth snapshot is published to the Redis channel
 *   futures.orderbook:{pairId}
 * which futures-ws-bridge.ts relays to subscribed WebSocket clients.
 */

import { getRedis, rPublish } from "./redis";
import { logger } from "./logger";

// ── Internal order representation ──────────────────────────────────────────────

interface BookOrder {
  id: number;
  userId: number;
  pairId: number;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  qty: number;
  filledQty: number;
  isBot: boolean;
}

// ── Public result types ────────────────────────────────────────────────────────

export interface FuturesTrade {
  makerOrderId: number;
  makerUserId: number;
  takerUserId: number;
  takerSide: "buy" | "sell";
  qty: number;
  price: number;
  takerIsBot: boolean;
  makerIsBot: boolean;
}

export interface FuturesMatchResult {
  trades: FuturesTrade[];
  status: "FILLED" | "OPEN" | "PARTIAL" | "REJECTED";
}

// ── Redis key helpers ──────────────────────────────────────────────────────────

const buyKey  = (pairId: number) => `fut:ob:${pairId}:buy`;
const sellKey = (pairId: number) => `fut:ob:${pairId}:sell`;
const ordKey  = (pairId: number, orderId: number) => `fut:ob:${pairId}:ord:${orderId}`;

// ── Per-pair async mutex ───────────────────────────────────────────────────────
// Serialises all mutations (place / cancel / seed) for a given pair so that
// concurrent Express route handlers cannot interleave their Redis reads/writes.

const pairLocks = new Map<number, Promise<void>>();

async function withPairLock<T>(pairId: number, fn: () => Promise<T>): Promise<T> {
  const prev = pairLocks.get(pairId) ?? Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>(res => { release = res; });
  pairLocks.set(pairId, lock);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (pairLocks.get(pairId) === lock) pairLocks.delete(pairId);
  }
}

// ── Engine stats ──────────────────────────────────────────────────────────────

let _stats = {
  matchesAttempted: 0,
  tradesExecuted: 0,
  ordersPlaced: 0,
  ordersCancelled: 0,
  ordersSeeded: 0,
};

export function getFuturesEngineStats() { return { ..._stats }; }
export function resetFuturesEngineStats() {
  _stats = { matchesAttempted: 0, tradesExecuted: 0, ordersPlaced: 0, ordersCancelled: 0, ordersSeeded: 0 };
}

// ── Low-level book helpers ─────────────────────────────────────────────────────

async function addToBook(r: any, pairId: number, o: BookOrder): Promise<void> {
  const score = o.side === "buy" ? -o.price : o.price;
  await r.zadd(o.side === "buy" ? buyKey(pairId) : sellKey(pairId), score, String(o.id));
  await r.set(ordKey(pairId, o.id), JSON.stringify(o), "EX", 86400);
}

async function removeFromBook(r: any, pairId: number, orderId: number, side: "buy" | "sell"): Promise<void> {
  await r.zrem(side === "buy" ? buyKey(pairId) : sellKey(pairId), String(orderId));
  await r.del(ordKey(pairId, orderId));
}

async function setOrderData(r: any, pairId: number, o: BookOrder): Promise<void> {
  await r.set(ordKey(pairId, o.id), JSON.stringify(o), "EX", 86400);
}

async function getOrderData(r: any, pairId: number, orderId: number): Promise<BookOrder | null> {
  const raw = await r.get(ordKey(pairId, orderId));
  if (!raw) return null;
  try { return JSON.parse(raw) as BookOrder; } catch { return null; }
}

// ── Best counterpart lookup ────────────────────────────────────────────────────

async function bestOpposite(
  r: any, pairId: number,
  takerSide: "buy" | "sell",
  limitPrice: number,
  isMarket: boolean,
): Promise<{ orderId: number; price: number } | null> {
  // Taker BUY  → hit SELL book (lowest ask = lowest score = index 0).
  // Taker SELL → hit BUY  book (highest bid = most-negative score = index 0).
  const oppSide = takerSide === "buy" ? "sell" : "buy";
  const key = oppSide === "buy" ? buyKey(pairId) : sellKey(pairId);
  const top = await r.zrange(key, 0, 0, "WITHSCORES");
  if (!top || top.length < 2) return null;
  const oppId    = Number(top[0]);
  const oppScore = Number(top[1]);
  const oppPrice = oppSide === "sell" ? oppScore : -oppScore;
  if (!isMarket) {
    if (takerSide === "buy"  && oppPrice > limitPrice) return null;
    if (takerSide === "sell" && oppPrice < limitPrice) return null;
  }
  return { orderId: oppId, price: oppPrice };
}

// ── Publish depth snapshot ─────────────────────────────────────────────────────
// Uses Redis pipelining to batch-fetch order metadata, then aggregates
// qty per price level and publishes the snapshot as JSON to pub/sub.

async function publishDepth(r: any, pairId: number): Promise<void> {
  try {
    const [bidIds, askIds] = await Promise.all([
      r.zrange(buyKey(pairId),  0, 24, "WITHSCORES"),
      r.zrange(sellKey(pairId), 0, 24, "WITHSCORES"),
    ]);

    const buildMap = async (ids: string[], side: "buy" | "sell"): Promise<Map<number, number>> => {
      const map = new Map<number, number>();
      if (!ids.length) return map;
      const pipeline = r.pipeline();
      for (let i = 0; i < ids.length - 1; i += 2) pipeline.get(ordKey(pairId, Number(ids[i])));
      const results: Array<any> = await pipeline.exec() ?? [];
      for (let i = 0; i < results.length; i++) {
        // ioredis pipeline exec returns [error, result] tuples
        const raw: string | null = Array.isArray(results[i]) ? (results[i] as any[])[1] : results[i];
        if (!raw || typeof raw !== "string") continue;
        try {
          const o = JSON.parse(raw) as BookOrder;
          const rem = Math.max(0, o.qty - o.filledQty);
          if (rem > 0) {
            const score = Number(ids[i * 2 + 1]);
            const price = side === "buy" ? -score : score;
            map.set(price, (map.get(price) ?? 0) + rem);
          }
        } catch {}
      }
      return map;
    };

    const [bidMap, askMap] = await Promise.all([
      buildMap(bidIds, "buy"),
      buildMap(askIds, "sell"),
    ]);

    const snapshot = {
      bids: Array.from(bidMap.entries()).sort((a, b) => b[0] - a[0]),
      asks: Array.from(askMap.entries()).sort((a, b) => a[0] - b[0]),
      timestamp: Date.now(),
    };
    await rPublish(`futures.orderbook:${pairId}`, snapshot);
  } catch (e: any) {
    logger.warn({ pairId, err: e?.message }, "[futures-engine] publishDepth failed");
  }
}

// ── Place order (main entry point) ─────────────────────────────────────────────

export async function futurePlaceOrder(order: {
  orderId: number;
  userId: number;
  pairId: number;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  qty: number;
  isBot: boolean;
}): Promise<FuturesMatchResult> {
  const r = getRedis();
  if (!r) {
    // No Redis → limit orders rest as OPEN, market orders rejected
    return { trades: [], status: order.type === "market" ? "REJECTED" : "OPEN" };
  }

  return withPairLock(order.pairId, async () => {
    _stats.matchesAttempted++;
    const trades: FuturesTrade[] = [];
    let remaining = order.qty;
    const isMarket = order.type === "market";

    // Add limit order to book first (may self-fill immediately below)
    const bookOrder: BookOrder = {
      id: order.orderId,
      userId: order.userId,
      pairId: order.pairId,
      side: order.side,
      type: order.type,
      price: order.price,
      qty: order.qty,
      filledQty: 0,
      isBot: order.isBot,
    };
    if (!isMarket) {
      await addToBook(r, order.pairId, bookOrder);
      _stats.ordersPlaced++;
    }

    // Match loop — cap at 500 fills to prevent runaway
    const MAX_FILLS = 500;
    for (let iter = 0; iter < MAX_FILLS && remaining > 1e-10; iter++) {
      const opp = await bestOpposite(r, order.pairId, order.side, order.price, isMarket);
      if (!opp) break;

      // Skip self (limit orders can match themselves when price crosses after addition)
      if (opp.orderId === order.orderId) break;

      // Load maker metadata
      const maker = await getOrderData(r, order.pairId, opp.orderId);
      if (!maker) {
        // Stale ZSET entry — clean up and retry
        const oppSide: "buy" | "sell" = order.side === "buy" ? "sell" : "buy";
        await r.zrem(oppSide === "buy" ? buyKey(order.pairId) : sellKey(order.pairId), String(opp.orderId));
        continue;
      }

      const makerRemaining = Math.max(0, maker.qty - maker.filledQty);
      if (makerRemaining <= 1e-10) {
        await removeFromBook(r, order.pairId, maker.id, maker.side);
        continue;
      }

      // Self-trade prevention: remove the maker and retry
      // Exception: bot↔bot trades are allowed (synthetic liquidity)
      if (maker.userId === order.userId && !(maker.isBot && order.isBot)) {
        await removeFromBook(r, order.pairId, maker.id, maker.side);
        continue;
      }

      const fillQty   = Math.min(remaining, makerRemaining);
      const fillPrice = maker.price; // price improvement always goes to taker

      // Update maker in Redis
      const newMakerFilled = maker.filledQty + fillQty;
      if (makerRemaining - fillQty <= 1e-10) {
        await removeFromBook(r, order.pairId, maker.id, maker.side);
      } else {
        await setOrderData(r, order.pairId, { ...maker, filledQty: newMakerFilled });
      }

      trades.push({
        makerOrderId: maker.id,
        makerUserId:  maker.userId,
        takerUserId:  order.userId,
        takerSide:    order.side,
        qty:          fillQty,
        price:        fillPrice,
        takerIsBot:   order.isBot,
        makerIsBot:   maker.isBot,
      });
      remaining -= fillQty;
      _stats.tradesExecuted++;
    }

    // Update taker's book entry after matching (limit orders only)
    if (!isMarket) {
      const takerFilled = order.qty - remaining;
      if (remaining <= 1e-10) {
        await removeFromBook(r, order.pairId, order.orderId, order.side);
      } else if (takerFilled > 0) {
        await setOrderData(r, order.pairId, { ...bookOrder, filledQty: takerFilled });
      }
    }

    const status: FuturesMatchResult["status"] =
      remaining <= 1e-10  ? "FILLED"   :
      trades.length > 0   ? "PARTIAL"  :
      isMarket            ? "REJECTED" : "OPEN";

    // Publish depth asynchronously (fire-and-forget) so the hot path isn't blocked
    void publishDepth(r, order.pairId);

    return { trades, status };
  });
}

// ── Cancel order ───────────────────────────────────────────────────────────────

export async function futuresCancelOrder(pairId: number, orderId: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  return withPairLock(pairId, async () => {
    // Try both sides — cancel callers don't always know the side
    await Promise.all([
      r.zrem(buyKey(pairId),  String(orderId)),
      r.zrem(sellKey(pairId), String(orderId)),
      r.del(ordKey(pairId, orderId)),
    ]);
    _stats.ordersCancelled++;
    void publishDepth(r, pairId);
  });
}

// ── Seed orderbook ─────────────────────────────────────────────────────────────
// Used at boot (restore open orders from DB) and by the bot service (re-seed
// user orders that were missing from the book after a restart).

export async function futuresSeedOrderbook(
  pairId: number,
  orders: Array<{
    id: number;
    userId: number;
    side: string;
    price: number;
    qty: number;
    isBot: boolean;
  }>,
  reset = false,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  return withPairLock(pairId, async () => {
    if (reset) {
      await r.del(buyKey(pairId), sellKey(pairId));
      // Scan and delete all order-detail keys for this pair
      let cursor = "0";
      do {
        const [next, keys]: [string, string[]] = await r.scan(cursor, "MATCH", `fut:ob:${pairId}:ord:*`, "COUNT", 200);
        cursor = next;
        if (keys.length > 0) await r.del(...keys);
      } while (cursor !== "0");
    }
    for (const o of orders) {
      const side = String(o.side) as "buy" | "sell";
      if (side !== "buy" && side !== "sell") continue;
      await addToBook(r, pairId, {
        id: o.id, userId: o.userId, pairId,
        side, type: "limit",
        price: o.price, qty: o.qty, filledQty: 0,
        isBot: o.isBot,
      });
      _stats.ordersSeeded++;
    }
    void publishDepth(r, pairId);
  });
}

// ── Get orderbook depth (REST) ─────────────────────────────────────────────────

export async function futuresGetOrderbook(
  pairId: number,
  depth = 50,
): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const r = getRedis();
  if (!r) return { bids: [], asks: [] };
  try {
    const [bidIds, askIds] = await Promise.all([
      r.zrange(buyKey(pairId),  0, depth - 1, "WITHSCORES"),
      r.zrange(sellKey(pairId), 0, depth - 1, "WITHSCORES"),
    ]);

    const aggregate = async (ids: string[], side: "buy" | "sell"): Promise<[number, number][]> => {
      const map = new Map<number, number>();
      if (!ids.length) return [];
      const pipeline = r.pipeline();
      for (let i = 0; i < ids.length - 1; i += 2) pipeline.get(ordKey(pairId, Number(ids[i])));
      const results: Array<any> = await pipeline.exec() ?? [];
      for (let i = 0; i < results.length; i++) {
        const raw: string | null = Array.isArray(results[i]) ? (results[i] as any[])[1] : results[i];
        if (!raw || typeof raw !== "string") continue;
        try {
          const o = JSON.parse(raw) as BookOrder;
          const rem = Math.max(0, o.qty - o.filledQty);
          if (rem > 0) {
            const score = Number(ids[i * 2 + 1]);
            const price = side === "buy" ? -score : score;
            map.set(price, (map.get(price) ?? 0) + rem);
          }
        } catch {}
      }
      const sorted = Array.from(map.entries()) as [number, number][];
      return side === "buy"
        ? sorted.sort((a, b) => b[0] - a[0])
        : sorted.sort((a, b) => a[0] - b[0]);
    };

    const [bids, asks] = await Promise.all([
      aggregate(bidIds, "buy"),
      aggregate(askIds, "sell"),
    ]);
    return { bids, asks };
  } catch { return { bids: [], asks: [] }; }
}
