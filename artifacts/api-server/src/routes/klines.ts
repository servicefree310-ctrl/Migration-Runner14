import { Router, type IRouter } from "express";
import { db, pairsTable, coinsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

type Kline = { ts: number; open: number; high: number; low: number; close: number; volume: number; src?: 'db' | 'ext' };
type CacheEntry = { data: Kline[]; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 4000;

const VALID_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w"]);

const INTERVAL_SECS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
  "1d": 86400, "1w": 604800,
};

const BYBIT_INTERVAL: Record<string, string> = {
  "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
  "1d": "D", "1w": "W",
};

const OKX_BAR: Record<string, string> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6Hutc", "12h": "12Hutc",
  "1d": "1Dutc", "1w": "1Wutc",
};

function toBaseSymbol(sym: string): string {
  const s = sym.toUpperCase().replace(/USDT$|INR$/, "");
  if (s === "USDT") return "USDC";
  return s;
}

function parseQuote(sym: string): 'USDT' | 'INR' {
  return sym.toUpperCase().endsWith('INR') ? 'INR' : 'USDT';
}

async function fetchBybit(base: string, interval: string, limit: number): Promise<Kline[]> {
  const sym = `${base}USDT`;
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${BYBIT_INTERVAL[interval]}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`bybit ${r.status}`);
  const j: any = await r.json();
  if (j?.retCode !== 0 || !j?.result?.list) throw new Error(`bybit ${j?.retMsg || "no list"}`);
  return (j.result.list as any[]).map((k) => ({
    ts: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    src: 'ext' as const,
  })).reverse();
}

async function fetchOkx(base: string, interval: string, limit: number): Promise<Kline[]> {
  const sym = `${base}-USDT`;
  const url = `https://www.okx.com/api/v5/market/candles?instId=${sym}&bar=${OKX_BAR[interval]}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`okx ${r.status}`);
  const j: any = await r.json();
  if (j?.code !== "0" || !Array.isArray(j?.data)) throw new Error(`okx ${j?.msg || "no data"}`);
  return (j.data as any[]).map((k) => ({
    ts: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    src: 'ext' as const,
  })).reverse();
}

async function fetchExternal(base: string, interval: string, limit: number): Promise<Kline[]> {
  let lastErr = "";
  for (const fn of [fetchBybit, fetchOkx]) {
    try {
      const c = await fn(base, interval, limit);
      if (c && c.length) return c;
    } catch (e: any) { lastErr = e?.message || String(e); }
  }
  if (lastErr) throw new Error(lastErr);
  return [];
}

async function findPairId(base: string, quote: 'USDT' | 'INR'): Promise<number | null> {
  const baseCoin = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, base)).limit(1);
  const quoteCoin = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, quote)).limit(1);
  if (!baseCoin[0] || !quoteCoin[0]) return null;
  const p = await db.select({ id: pairsTable.id }).from(pairsTable)
    .where(and(eq(pairsTable.baseCoinId, baseCoin[0].id), eq(pairsTable.quoteCoinId, quoteCoin[0].id))).limit(1);
  return p[0]?.id ?? null;
}

async function fetchDbCandles(pairId: number, intervalSecs: number, limit: number): Promise<Kline[]> {
  const sinceSecs = Math.floor(Date.now() / 1000) - intervalSecs * limit;
  // UNION spot trades + futures trades so both spot and futures pairs produce real candles.
  // For spot-only pairs futures_trades returns 0 rows (safe). For futures pairs,
  // spot trades returns 0 rows and futures_trades provides the real fills.
  const rows = await db.execute(sql`
    WITH bucketed AS (
      SELECT
        (FLOOR(EXTRACT(EPOCH FROM created_at) / ${intervalSecs})::bigint * ${intervalSecs} * 1000)::bigint AS ts,
        price::float8 AS price,
        qty::float8 AS qty,
        created_at
      FROM trades
      WHERE pair_id = ${pairId}
        AND created_at >= to_timestamp(${sinceSecs})
      UNION ALL
      SELECT
        (FLOOR(EXTRACT(EPOCH FROM created_at) / ${intervalSecs})::bigint * ${intervalSecs} * 1000)::bigint AS ts,
        price::float8 AS price,
        qty::float8 AS qty,
        created_at
      FROM futures_trades
      WHERE pair_id = ${pairId}
        AND created_at >= to_timestamp(${sinceSecs})
    )
    SELECT
      ts,
      (ARRAY_AGG(price ORDER BY created_at ASC))[1]  AS open,
      MAX(price)                                       AS high,
      MIN(price)                                       AS low,
      (ARRAY_AGG(price ORDER BY created_at DESC))[1] AS close,
      SUM(qty)                                         AS volume
    FROM bucketed
    GROUP BY ts
    ORDER BY ts ASC
  `);
  const list: any[] = (rows as any).rows ?? (Array.isArray(rows) ? rows : []);
  return list.map((r: any) => ({
    ts: Number(r.ts),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    src: 'db' as const,
  }));
}

router.get("/klines", async (req, res): Promise<void> => {
  const symbolRaw = String(req.query.symbol || "BTC").toUpperCase();
  const interval = String(req.query.interval || "1m");
  const limit = Math.max(10, Math.min(Number(req.query.limit) || 120, 500));
  const source = String(req.query.source || 'auto'); // 'auto' | 'db' | 'ext'
  if (!VALID_INTERVALS.has(interval)) { res.status(400).json({ error: "invalid interval" }); return; }

  const base = toBaseSymbol(symbolRaw);
  const quote = parseQuote(symbolRaw);
  const intervalSecs = INTERVAL_SECS[interval];
  const key = `${symbolRaw}:${interval}:${limit}:${source}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) { res.json({ symbol: symbolRaw, interval, candles: hit.data }); return; }

  // 1) Try DB candles for this pair
  let dbCandles: Kline[] = [];
  let pairId: number | null = null;
  try {
    pairId = await findPairId(base, quote);
    if (pairId) dbCandles = await fetchDbCandles(pairId, intervalSecs, limit);
  } catch { /* swallow, fall back */ }

  let candles: Kline[] = [];

  if (source === 'db') {
    candles = dbCandles;
  } else {
    // 2) Fetch external (USDT base feed) and convert to INR if needed via current pair price
    let ext: Kline[] = [];
    try { ext = await fetchExternal(base, interval, limit); } catch { /* ignore */ }

    // If quote is INR, scale ext USDT prices to INR using current pair lastPrice ratio
    if (quote === 'INR' && ext.length && pairId) {
      const pairRow = await db.select({ lastPrice: pairsTable.lastPrice }).from(pairsTable).where(eq(pairsTable.id, pairId)).limit(1);
      const lastInr = Number(pairRow[0]?.lastPrice || 0);
      const lastUsdt = ext[ext.length - 1].close;
      const ratio = lastUsdt > 0 && lastInr > 0 ? (lastInr / lastUsdt) : 0;
      if (ratio > 0) ext = ext.map(c => ({ ...c, open: c.open * ratio, high: c.high * ratio, low: c.low * ratio, close: c.close * ratio }));
    }

    if (source === 'ext') {
      candles = ext;
    } else {
      // 'auto' merge: external as base, overlay DB candles where present
      const map = new Map<number, Kline>();
      for (const c of ext) map.set(c.ts, c);
      for (const c of dbCandles) map.set(c.ts, c);
      candles = Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    }
  }

  if (!candles.length) {
    if (hit) { res.json({ symbol: symbolRaw, interval, candles: hit.data, stale: true }); return; }
    res.status(502).json({ error: "no candles available" });
    return;
  }

  // Trim to last `limit` candles
  if (candles.length > limit) candles = candles.slice(-limit);

  cache.set(key, { data: candles, expires: now + CACHE_TTL_MS });
  res.json({ symbol: symbolRaw, interval, candles, dbBuckets: dbCandles.length });
});

export default router;
