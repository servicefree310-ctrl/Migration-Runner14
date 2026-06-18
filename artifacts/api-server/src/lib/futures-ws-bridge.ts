/**
 * futures-ws-bridge.ts — Redis pub/sub based futures orderbook relay
 *
 * Subscribes to the Redis pattern "futures.orderbook:*" that
 * futures-matching-engine.ts publishes to after every book change.
 * Forwards the depth snapshot to all WS connections subscribed to that symbol.
 *
 * Public interface is identical to the old Go-WS bridge so index.ts is
 * unchanged: onFuturesOrderbook / isFuturesPair / getPairIdBySymbol /
 * startFuturesBridge.
 */

import { getSubRedis } from "./redis";
import { logger } from "./logger";

type OBData = Record<string, unknown>;
type OBCallback = (symbol: string, data: OBData) => void;

const listeners = new Set<OBCallback>();

/** Last-known depth snapshot per symbol — used to seed new WS subscribers instantly. */
const lastDepth = new Map<string, OBData>();

/** Register a callback for every futures orderbook update. Returns unsub fn. */
export function onFuturesOrderbook(cb: OBCallback): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Return the most-recently published depth snapshot for a symbol, or undefined. */
export function getLastFuturesDepth(symbol: string): OBData | undefined {
  return lastDepth.get(symbol);
}

// pairId → symbol and reverse maps (refreshed from DB every 5 min)
let pairCache   = new Map<number, string>();
let symToPairId = new Map<string, number>();

export function isFuturesPair(sym: string): boolean      { return symToPairId.has(sym); }
export function getPairIdBySymbol(sym: string): number | undefined { return symToPairId.get(sym); }

async function loadPairCache(): Promise<void> {
  try {
    const { db, pairsTable, coinsTable } = await import("@workspace/db");
    const { eq, inArray } = await import("drizzle-orm");
    const rows = await db
      .select({ id: pairsTable.id, baseCoinId: pairsTable.baseCoinId, quoteCoinId: pairsTable.quoteCoinId })
      .from(pairsTable)
      .where(eq(pairsTable.futuresEnabled, true));
    const coinIds = [...new Set(rows.flatMap(r => [r.baseCoinId, r.quoteCoinId]))];
    const coins = coinIds.length
      ? await db.select({ id: coinsTable.id, symbol: coinsTable.symbol })
          .from(coinsTable).where(inArray(coinsTable.id, coinIds))
      : [];
    const coinMap = new Map(coins.map(c => [c.id, c.symbol]));
    const m  = new Map<number, string>();
    const rm = new Map<string, number>();
    for (const row of rows) {
      const base  = coinMap.get(row.baseCoinId);
      const quote = coinMap.get(row.quoteCoinId);
      if (base && quote) {
        const sym = `${base}/${quote}`;
        m.set(row.id, sym);
        rm.set(sym, row.id);
      }
    }
    pairCache   = m;
    symToPairId = rm;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[futures-bridge] pair cache load failed");
  }
}

let started = false;

/**
 * Start the Redis pub/sub listener for futures orderbook updates.
 * Safe to call multiple times — only starts once.
 */
export async function startFuturesBridge(): Promise<void> {
  if (started) return;
  started = true;

  await loadPairCache();
  // Refresh pair cache every 5 min to pick up newly enabled futures markets
  setInterval(() => { void loadPairCache(); }, 5 * 60_000);

  const sub = getSubRedis();
  if (!sub) {
    logger.warn("[futures-bridge] Redis sub client unavailable — futures orderbook WS relay disabled");
    return;
  }

  try {
    await sub.psubscribe("futures.orderbook:*");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[futures-bridge] psubscribe failed");
    return;
  }

  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const m = channel.match(/^futures\.orderbook:(\d+)$/);
    if (!m) return;
    const pairId = Number(m[1]);
    const symbol = pairCache.get(pairId);
    if (!symbol) return;
    let data: OBData;
    try { data = JSON.parse(message) as OBData; } catch { return; }
    lastDepth.set(symbol, data);
    for (const cb of listeners) { try { cb(symbol, data); } catch {} }
  });

  logger.info("[futures-bridge] Redis pub/sub started (pattern: futures.orderbook:*)");
}
