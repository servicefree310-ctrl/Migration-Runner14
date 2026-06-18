// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC /api/v1/* routes  — no authentication required
// Provides a Binance-style public REST API surface for the exchange.
// ═══════════════════════════════════════════════════════════════════════════
import { Router, type IRouter } from "express";
import {
  db,
  coinsTable,
  networksTable,
  pairsTable,
  ordersTable,
  tradesTable,
  earnProductsTable,
  aiTradingPlansTable,
  aiTradingSubscriptionsTable,
  aiTradingEarningsTable,
  announcementsTable,
  newsItemsTable,
  bannersTable,
  promotionsTable,
  competitionsTable,
  settingsTable,
  usersTable,
  referralsTable,
  legalPagesTable,
  futuresPositionsTable,
} from "@workspace/db";
import { eq, and, desc, asc, count, sql } from "drizzle-orm";
import { getCache, getInrRate } from "../lib/price-service";
import { rGet, rSet } from "../lib/redis";

// Normalise symbol: strip "/" and "-" so both "BTC/USDT" and "BTCUSDT" work.
// DB stores pairs without separator e.g. "BTCUSDT", "ADAINR".
function normSym(s: string): string {
  return s.toUpperCase().replace(/[\/\-]/g, "");
}

const router: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function getEnrichedPairs() {
  const [pairs, coins] = await Promise.all([
    db
      .select()
      .from(pairsTable)
      .where(and(eq(pairsTable.status, "active"), eq(pairsTable.tradingEnabled, true)))
      .orderBy(pairsTable.symbol),
    db.select().from(coinsTable),
  ]);
  const coinById = new Map(coins.map((c: any) => [c.id, c]));
  const ticks = getCache();
  const tickMap = new Map(ticks.map((t) => [t.symbol, t]));
  return pairs
    .map((p: any) => {
      const base = coinById.get(p.baseCoinId) as any;
      const quote = coinById.get(p.quoteCoinId) as any;
      if (!base || !quote) return null;
      const tick = tickMap.get(base.symbol);
      return {
        symbol: p.symbol,
        baseSymbol: base.symbol,
        quoteSymbol: quote.symbol,
        baseName: base.name,
        quoteName: quote.name,
        lastPrice: Number(p.lastPrice ?? 0),
        change24h: tick?.change24h ?? 0,
        volume24h: tick?.volume24h ?? 0,
        high24h: Number(p.high24h ?? 0),
        low24h: Number(p.low24h ?? 0),
        status: p.status,
        minQty: Number(p.minQty ?? 0),
        pricePrecision: p.pricePrecision ?? 2,
        qtyPrecision: p.qtyPrecision ?? 5,
        makerFee: Number(p.makerFee ?? 0.001),
        takerFee: Number(p.takerFee ?? 0.001),
      };
    })
    .filter(Boolean);
}

async function getOrderBook(symbol: string, depth: number) {
  const [pair] = await db
    .select()
    .from(pairsTable)
    .where(eq(pairsTable.symbol, normSym(symbol)))
    .limit(1);
  if (!pair) return null;
  const [bidRows, askRows] = await Promise.all([
    db.execute(sql`
      SELECT price::text AS price, SUM(qty - filled_qty)::text AS qty
      FROM orders WHERE pair_id = ${pair.id} AND side = 'buy'
        AND status IN ('open','partial') AND type IN ('limit','post_only')
      GROUP BY price ORDER BY price DESC LIMIT ${depth}
    `),
    db.execute(sql`
      SELECT price::text AS price, SUM(qty - filled_qty)::text AS qty
      FROM orders WHERE pair_id = ${pair.id} AND side = 'sell'
        AND status IN ('open','partial') AND type IN ('limit','post_only')
      GROUP BY price ORDER BY price ASC LIMIT ${depth}
    `),
  ]);
  const mapRow = (r: any) => ({ price: Number(r.price), qty: Number(r.qty) });
  return {
    symbol,
    pairId: pair.id,
    bids: ((bidRows as any).rows ?? []).map(mapRow).filter((r: any) => r.qty > 0),
    asks: ((askRows as any).rows ?? []).map(mapRow).filter((r: any) => r.qty > 0),
    ts: Date.now(),
  };
}

async function getRecentTradeRows(symbol: string, limit: number) {
  const [pair] = await db
    .select({ id: pairsTable.id })
    .from(pairsTable)
    .where(eq(pairsTable.symbol, normSym(symbol)))
    .limit(1);
  if (!pair) return null;
  const rows = await db
    .select({
      id: tradesTable.id,
      price: tradesTable.price,
      qty: tradesTable.qty,
      side: tradesTable.side,
      createdAt: tradesTable.createdAt,
    })
    .from(tradesTable)
    .where(and(eq(tradesTable.pairId, pair.id), eq(tradesTable.isTaker, 1)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    price: Number(r.price),
    qty: Number(r.qty),
    side: r.side,
    ts: new Date(r.createdAt).getTime(),
  }));
}

function buildTickers() {
  const ticks = getCache();
  const inrRate = getInrRate();
  return ticks.map((t) => ({
    symbol: t.symbol,
    priceUsd: t.usdt,
    priceInr: t.inr,
    change24h: t.change24h,
    volume24h: t.volume24h,
    inrRate,
    ts: t.ts,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/ping", (_req, res): void => {
  res.json({ ping: "pong", ts: Date.now() });
});

router.get("/v1/time", (_req, res): void => {
  const now = Date.now();
  res.json({ serverTime: now, iso: new Date(now).toISOString() });
});

router.get("/v1/status", async (_req, res): Promise<void> => {
  const raw = await getSetting("site.maintenance");
  let maint = { enabled: false, message: "" };
  try { if (raw) maint = JSON.parse(raw); } catch {}
  res.json({
    status: maint.enabled ? "maintenance" : "operational",
    maintenance: maint.enabled,
    message: maint.message || "",
    ts: Date.now(),
  });
});

router.get("/v1/exchangeInfo", async (_req, res): Promise<void> => {
  const [pairs, coins] = await Promise.all([
    db.select({ id: pairsTable.id }).from(pairsTable).where(and(eq(pairsTable.status, "active"), eq(pairsTable.tradingEnabled, true))),
    db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.isListed, true)),
  ]);
  const brand = await getSetting("site.brand");
  let brandObj: any = { name: "Zebvix" };
  try { if (brand) brandObj = JSON.parse(brand); } catch {}
  res.json({
    exchange: brandObj.name || "Zebvix",
    pairsCount: pairs.length,
    coinsCount: coins.length,
    orderTypes: ["limit", "market", "stop_limit", "post_only"],
    supportedIntervals: ["1m","3m","5m","15m","30m","1h","2h","4h","6h","12h","1d","1w"],
    inrRate: getInrRate(),
    ts: Date.now(),
  });
});

router.get("/v1/server/info", (_req, res): void => {
  res.json({
    name: "Zebvix Exchange API",
    version: "1.0.0",
    runtime: `Node.js ${process.version}`,
    uptime: Math.floor(process.uptime()),
    ts: Date.now(),
  });
});

router.get("/v1/server/version", (_req, res): void => {
  res.json({ version: "1.0.0", api: "v1", ts: Date.now() });
});

router.get("/v1/server/health", (_req, res): void => {
  res.json({ status: "healthy", uptime: Math.floor(process.uptime()), ts: Date.now() });
});

router.get("/v1/server/maintenance", async (_req, res): Promise<void> => {
  const raw = await getSetting("site.maintenance");
  let maint = { enabled: false, message: "", eta: "" };
  try { if (raw) maint = JSON.parse(raw); } catch {}
  res.json({ maintenance: maint.enabled, message: maint.message || "", eta: maint.eta || "", ts: Date.now() });
});

router.get("/v1/server/statistics", async (_req, res): Promise<void> => {
  const CK = "v1:server:statistics";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const [uRows, tRows] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(tradesTable),
  ]);
  const payload = { users: uRows[0]?.count ?? 0, trades: tRows[0]?.count ?? 0, coins: getCache().length, inrRate: getInrRate(), ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 60);
  res.json(payload);
});

router.get("/v1/server/config", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const PUBLIC_KEYS = ["site.brand", "site.features", "site.footer", "site.banner_strip"];
  const cfg: Record<string, any> = {};
  rows.forEach((r: any) => {
    if (PUBLIC_KEYS.includes(r.key)) {
      try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
    }
  });
  res.json({ config: cfg, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// MARKETS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/markets", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  res.json({ markets, count: markets.length, ts: Date.now() });
});

router.get("/v1/markets/search", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").toUpperCase();
  const markets = await getEnrichedPairs();
  const filtered = q
    ? markets.filter((p: any) => p.symbol.includes(q) || p.baseSymbol.includes(q) || p.baseName?.toUpperCase().includes(q))
    : markets;
  res.json({ markets: filtered, count: filtered.length, ts: Date.now() });
});

router.get("/v1/markets/trending", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].sort((a: any, b: any) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/new", async (_req, res): Promise<void> => {
  const markets = await db.select().from(pairsTable).where(eq(pairsTable.status, "active")).orderBy(desc(pairsTable.createdAt)).limit(10);
  res.json({ markets, count: markets.length, ts: Date.now() });
});

router.get("/v1/markets/gainers", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].filter((p: any) => p.change24h > 0).sort((a: any, b: any) => b.change24h - a.change24h).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/losers", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].filter((p: any) => p.change24h < 0).sort((a: any, b: any) => a.change24h - b.change24h).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/high-volume", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].sort((a: any, b: any) => b.volume24h - a.volume24h).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/top", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].sort((a: any, b: any) => b.volume24h - a.volume24h).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/favorites", (_req, res): void => {
  res.json({ markets: [], count: 0, note: "Authentication required for personalized favorites", ts: Date.now() });
});

router.get("/v1/markets/popular", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  const sorted = [...markets].sort((a: any, b: any) => b.volume24h - a.volume24h).slice(0, 20);
  res.json({ markets: sorted, count: sorted.length, ts: Date.now() });
});

router.get("/v1/markets/featured", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  res.json({ markets: markets.slice(0, 8), count: Math.min(markets.length, 8), ts: Date.now() });
});

// NOTE: parameterised route must come AFTER all /markets/<literal> routes
router.get("/v1/markets/:symbol", async (req, res): Promise<void> => {
  const sym = normSym(req.params.symbol);
  const markets = await getEnrichedPairs();
  const market = markets.find((p: any) => p.symbol === sym);
  if (!market) { res.status(404).json({ error: "Market not found" }); return; }
  res.json({ market, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// TICKER
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/ticker", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const tickers = buildTickers();
  if (symbol) {
    const t = tickers.find((x) => x.symbol === symbol);
    if (!t) { res.status(404).json({ error: "Symbol not found" }); return; }
    res.json({ ticker: t, ts: Date.now() });
    return;
  }
  res.json({ tickers, count: tickers.length, ts: Date.now() });
});

router.get("/v1/ticker/all", (_req, res): void => {
  const tickers = buildTickers();
  res.json({ tickers, count: tickers.length, ts: Date.now() });
});

router.get("/v1/ticker/24hr", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const tickers = buildTickers();
  if (symbol) {
    const t = tickers.find((x) => x.symbol === symbol);
    if (!t) { res.status(404).json({ error: "Symbol not found" }); return; }
    res.json(t);
    return;
  }
  res.json(tickers);
});

router.get("/v1/ticker/price", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const ticks = getCache();
  if (symbol) {
    const t = ticks.find((x) => x.symbol === symbol);
    if (!t) { res.status(404).json({ error: "Symbol not found" }); return; }
    res.json({ symbol: t.symbol, priceUsd: t.usdt, priceInr: t.inr, ts: t.ts });
    return;
  }
  res.json(ticks.map((t) => ({ symbol: t.symbol, priceUsd: t.usdt, priceInr: t.inr, ts: t.ts })));
});

router.get("/v1/ticker/bookTicker", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? normSym(String(req.query.symbol)) : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const [bidRows, askRows] = await Promise.all([
    db.execute(sql`SELECT MAX(price::float8) AS price FROM orders WHERE pair_id = ${pair.id} AND side = 'buy' AND status IN ('open','partial') AND type IN ('limit','post_only')`),
    db.execute(sql`SELECT MIN(price::float8) AS price FROM orders WHERE pair_id = ${pair.id} AND side = 'sell' AND status IN ('open','partial') AND type IN ('limit','post_only')`),
  ]);
  res.json({
    symbol,
    bidPrice: (bidRows as any).rows?.[0]?.price ?? null,
    askPrice: (askRows as any).rows?.[0]?.price ?? null,
    ts: Date.now(),
  });
});

router.get("/v1/ticker/mini", (_req, res): void => {
  const ticks = getCache();
  res.json(ticks.map((t) => ({ symbol: t.symbol, price: t.usdt, change24h: t.change24h, ts: t.ts })));
});

router.get("/v1/ticker/rolling", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const tickers = buildTickers();
  const filtered = symbol ? tickers.filter((x) => x.symbol === symbol) : tickers;
  res.json({ tickers: filtered, window: "24h", ts: Date.now() });
});

router.get("/v1/ticker/statistics", (_req, res): void => {
  const ticks = buildTickers();
  const gainers = ticks.filter((t) => t.change24h > 0).length;
  const losers = ticks.filter((t) => t.change24h < 0).length;
  const avgChange = ticks.length ? ticks.reduce((s, t) => s + t.change24h, 0) / ticks.length : 0;
  res.json({
    total: ticks.length,
    gainers,
    losers,
    neutral: ticks.length - gainers - losers,
    avgChange24h: avgChange,
    ts: Date.now(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDER BOOK
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/depth", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, limit);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json(ob);
});

router.get("/v1/orderbook", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, limit);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json(ob);
});

router.get("/v1/orderbook/full", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, 100);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json(ob);
});

router.get("/v1/orderbook/snapshot", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, limit);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ ...ob, snapshotAt: Date.now() });
});

router.get("/v1/orderbook/bids", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, limit);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ symbol, bids: ob.bids, ts: ob.ts });
});

router.get("/v1/orderbook/asks", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, limit);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ symbol, asks: ob.asks, ts: ob.ts });
});

router.get("/v1/orderbook/spread", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, 1);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  const bestBid = ob.bids[0]?.price ?? 0;
  const bestAsk = ob.asks[0]?.price ?? 0;
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;
  res.json({ symbol, bestBid, bestAsk, spread, spreadPct, ts: ob.ts });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRADES
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/trades", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const trades = await getRecentTradeRows(symbol, limit);
  if (!trades) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ symbol, trades, count: trades.length, ts: Date.now() });
});

router.get("/v1/recentTrades", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const trades = await getRecentTradeRows(symbol, limit);
  if (!trades) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ symbol, trades, count: trades.length, ts: Date.now() });
});

router.get("/v1/historicalTrades", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [pair] = await db.select({ id: pairsTable.id }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const rows = await db
    .select({ id: tradesTable.id, price: tradesTable.price, qty: tradesTable.qty, side: tradesTable.side, createdAt: tradesTable.createdAt })
    .from(tradesTable)
    .where(and(eq(tradesTable.pairId, pair.id), eq(tradesTable.isTaker, 1)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);
  res.json({
    symbol,
    trades: rows.map((r) => ({ id: r.id, price: Number(r.price), qty: Number(r.qty), side: r.side, ts: new Date(r.createdAt).getTime() })),
    ts: Date.now(),
  });
});

router.get("/v1/aggTrades", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [pair] = await db.select({ id: pairsTable.id }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const rows = await db.execute(sql`
    SELECT price, side, SUM(qty::float8) AS qty, COUNT(*) AS trade_count,
           MIN(id) AS first_id, MAX(id) AS last_id, MAX(created_at) AS ts
    FROM trades WHERE pair_id = ${pair.id} AND is_taker = 1
    GROUP BY price, side ORDER BY ts DESC LIMIT ${limit}
  `);
  const list: any[] = (rows as any).rows ?? [];
  res.json({
    symbol,
    aggTrades: list.map((r) => ({
      price: Number(r.price),
      qty: Number(r.qty),
      side: r.side,
      tradeCount: Number(r.trade_count),
      firstId: r.first_id,
      lastId: r.last_id,
      ts: new Date(r.ts).getTime(),
    })),
    ts: Date.now(),
  });
});

router.get("/v1/trade/history", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const trades = await getRecentTradeRows(symbol, limit);
  if (!trades) { res.status(404).json({ error: "Pair not found" }); return; }
  res.json({ symbol, trades, count: trades.length, ts: Date.now() });
});

router.get("/v1/trade/statistics", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [pair] = await db.select({ id: pairsTable.id }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const since = new Date(Date.now() - 86_400_000);
  const stats = await db.execute(sql`
    SELECT COUNT(*)::int AS trade_count, SUM(qty::float8) AS volume,
           SUM(price::float8 * qty::float8) AS quote_volume,
           AVG(price::float8) AS avg_price, MAX(price::float8) AS high, MIN(price::float8) AS low
    FROM trades WHERE pair_id = ${pair.id} AND created_at >= ${since} AND is_taker = 1
  `);
  const s = (stats as any).rows?.[0] ?? {};
  res.json({
    symbol,
    tradeCount: Number(s.trade_count ?? 0),
    volume24h: Number(s.volume ?? 0),
    quoteVolume24h: Number(s.quote_volume ?? 0),
    avgPrice: Number(s.avg_price ?? 0),
    high24h: Number(s.high ?? 0),
    low24h: Number(s.low ?? 0),
    ts: Date.now(),
  });
});

router.get("/v1/trade/volume", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [pair] = await db.select({ id: pairsTable.id }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const since = new Date(Date.now() - 86_400_000);
  const vol = await db.execute(sql`
    SELECT SUM(qty::float8) AS volume, SUM(price::float8 * qty::float8) AS quote_volume
    FROM trades WHERE pair_id = ${pair.id} AND created_at >= ${since} AND is_taker = 1
  `);
  const v = (vol as any).rows?.[0] ?? {};
  res.json({ symbol, volume24h: Number(v.volume ?? 0), quoteVolume24h: Number(v.quote_volume ?? 0), ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// KLINES  — proxy to the existing /klines handler via redirect
// ═══════════════════════════════════════════════════════════════════════════

function klinesRedirect(req: any, res: any): void {
  const { symbol = "BTC/USDT", interval = "1h", limit = 120, source = "auto" } = req.query;
  res.redirect(`/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&source=${source}`);
}

router.get("/v1/klines", klinesRedirect);
router.get("/v1/uiKlines", klinesRedirect);
router.get("/v1/candles", klinesRedirect);
router.get("/v1/ohlcv", klinesRedirect);
router.get("/v1/chart/history", klinesRedirect);

// ═══════════════════════════════════════════════════════════════════════════
// COINS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/coins", async (_req, res): Promise<void> => {
  const coins = await db.select().from(coinsTable).where(eq(coinsTable.isListed, true)).orderBy(coinsTable.symbol);
  const tickMap = new Map(getCache().map((t) => [t.symbol, t]));
  const enriched = coins.map((c: any) => {
    const tick = tickMap.get(c.symbol);
    return { ...c, priceUsd: tick?.usdt ?? Number(c.currentPrice ?? 0), priceInr: tick?.inr ?? 0, change24h: tick?.change24h ?? Number(c.change24h ?? 0) };
  });
  res.json({ coins: enriched, count: enriched.length, ts: Date.now() });
});

router.get("/v1/assets", async (_req, res): Promise<void> => {
  const coins = await db.select().from(coinsTable).where(eq(coinsTable.isListed, true)).orderBy(coinsTable.symbol);
  res.json({ assets: coins, count: coins.length, ts: Date.now() });
});

router.get("/v1/networks", async (req, res): Promise<void> => {
  const coinId = req.query.coinId ? Number(req.query.coinId) : null;
  const rows = coinId
    ? await db.select().from(networksTable).where(and(eq(networksTable.coinId, coinId), eq(networksTable.status, "active")))
    : await db.select().from(networksTable).where(eq(networksTable.status, "active"));
  res.json({ networks: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/network/status", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ chain: networksTable.chain, status: networksTable.status, depositEnabled: networksTable.depositEnabled, withdrawEnabled: networksTable.withdrawEnabled })
    .from(networksTable);
  res.json({ networks: rows, ts: Date.now() });
});

// NOTE: /v1/network/status above must come before the param route below
router.get("/v1/network/:network", async (req, res): Promise<void> => {
  const chain = String(req.params.network).toUpperCase();
  const rows = await db.select().from(networksTable).where(and(eq(networksTable.chain, chain), eq(networksTable.status, "active")));
  res.json({ network: chain, networks: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/deposit-fees", async (_req, res): Promise<void> => {
  const nets = await db
    .select({ chain: networksTable.chain, coinId: networksTable.coinId, minDeposit: networksTable.minDeposit })
    .from(networksTable)
    .where(eq(networksTable.status, "active"));
  res.json({ fees: nets, ts: Date.now() });
});

router.get("/v1/withdraw-fees", async (_req, res): Promise<void> => {
  const nets = await db
    .select({ chain: networksTable.chain, coinId: networksTable.coinId, withdrawFee: networksTable.withdrawFee, minWithdraw: networksTable.minWithdraw })
    .from(networksTable)
    .where(eq(networksTable.status, "active"));
  res.json({ fees: nets, ts: Date.now() });
});

router.get("/v1/minimum-deposit", async (_req, res): Promise<void> => {
  const nets = await db
    .select({ chain: networksTable.chain, coinId: networksTable.coinId, minDeposit: networksTable.minDeposit })
    .from(networksTable)
    .where(eq(networksTable.status, "active"));
  res.json({ minimums: nets, ts: Date.now() });
});

router.get("/v1/minimum-withdraw", async (_req, res): Promise<void> => {
  const nets = await db
    .select({ chain: networksTable.chain, coinId: networksTable.coinId, minWithdraw: networksTable.minWithdraw })
    .from(networksTable)
    .where(eq(networksTable.status, "active"));
  res.json({ minimums: nets, ts: Date.now() });
});

router.get("/v1/confirmation-count", async (_req, res): Promise<void> => {
  const nets = await db
    .select({ chain: networksTable.chain, coinId: networksTable.coinId, confirmations: networksTable.confirmations })
    .from(networksTable)
    .where(eq(networksTable.status, "active"));
  res.json({ confirmations: nets, ts: Date.now() });
});

router.get("/v1/token/info", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) { res.status(404).json({ error: "Token not found" }); return; }
  const nets = await db.select().from(networksTable).where(eq(networksTable.coinId, coin.id));
  res.json({ coin, networks: nets, ts: Date.now() });
});

// NOTE: /v1/coin/:symbol after /v1/coins to avoid route shadowing
router.get("/v1/coin/:symbol", async (req, res): Promise<void> => {
  const sym = String(req.params.symbol).toUpperCase();
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym)).limit(1);
  if (!coin) { res.status(404).json({ error: "Coin not found" }); return; }
  const tick = getCache().find((t) => t.symbol === sym);
  res.json({
    ...coin,
    priceUsd: tick?.usdt ?? Number(coin.currentPrice ?? 0),
    priceInr: tick?.inr ?? 0,
    change24h: tick?.change24h ?? Number(coin.change24h ?? 0),
    ts: Date.now(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPOT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/spot/pairs", async (_req, res): Promise<void> => {
  const pairs = await getEnrichedPairs();
  res.json({ pairs, count: pairs.length, ts: Date.now() });
});

router.get("/v1/spot/statistics", (_req, res): void => {
  const ticks = getCache();
  const totalVol = ticks.reduce((s, t) => s + t.volume24h, 0);
  res.json({ totalVolume24hUsd: totalVol, coinsTracked: ticks.length, inrRate: getInrRate(), ts: Date.now() });
});

router.get("/v1/spot/top-volume", async (_req, res): Promise<void> => {
  const pairs = await getEnrichedPairs();
  const sorted = [...pairs].sort((a: any, b: any) => b.volume24h - a.volume24h).slice(0, 20);
  res.json({ pairs: sorted, ts: Date.now() });
});

router.get("/v1/spot/top-gainers", async (_req, res): Promise<void> => {
  const pairs = await getEnrichedPairs();
  const sorted = [...pairs].filter((p: any) => p.change24h > 0).sort((a: any, b: any) => b.change24h - a.change24h).slice(0, 20);
  res.json({ pairs: sorted, ts: Date.now() });
});

router.get("/v1/spot/top-losers", async (_req, res): Promise<void> => {
  const pairs = await getEnrichedPairs();
  const sorted = [...pairs].filter((p: any) => p.change24h < 0).sort((a: any, b: any) => a.change24h - b.change24h).slice(0, 20);
  res.json({ pairs: sorted, ts: Date.now() });
});

router.get("/v1/spot/liquidity", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? normSym(String(req.query.symbol)) : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  const ob = await getOrderBook(symbol, 20);
  if (!ob) { res.status(404).json({ error: "Pair not found" }); return; }
  const bidLiq = ob.bids.reduce((s: number, b: any) => s + b.price * b.qty, 0);
  const askLiq = ob.asks.reduce((s: number, a: any) => s + a.price * a.qty, 0);
  res.json({ symbol, bidLiquidity: bidLiq, askLiquidity: askLiq, totalLiquidity: bidLiq + askLiq, ts: Date.now() });
});

router.get("/v1/spot/markets", async (_req, res): Promise<void> => {
  const markets = await getEnrichedPairs();
  res.json({ markets, count: markets.length, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// FUTURES
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/futures/contracts", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(pairsTable).where(and(eq(pairsTable.status, "active"), eq(pairsTable.futuresEnabled, true)));
  res.json({ contracts: pairs, count: pairs.length, ts: Date.now() });
});

router.get("/v1/futures/index-price", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const ticks = getCache();
  if (symbol) {
    const base = symbol.replace(/USDT$|INR$|PERP$|-PERP$/i, "");
    const tick = ticks.find((t) => t.symbol === base);
    res.json({ symbol, indexPrice: tick?.usdt ?? 0, ts: Date.now() });
    return;
  }
  res.json({ prices: ticks.map((t) => ({ symbol: `${t.symbol}USDT`, indexPrice: t.usdt })), ts: Date.now() });
});

router.get("/v1/futures/mark-price", (req, res): void => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  const ticks = getCache();
  if (symbol) {
    const base = symbol.replace(/USDT$|INR$|PERP$|-PERP$/i, "");
    const tick = ticks.find((t) => t.symbol === base);
    const idx = tick?.usdt ?? 0;
    res.json({ symbol, markPrice: idx * 1.0005, indexPrice: idx, ts: Date.now() });
    return;
  }
  res.json({ prices: ticks.map((t) => ({ symbol: `${t.symbol}USDT`, markPrice: t.usdt * 1.0005, indexPrice: t.usdt })), ts: Date.now() });
});

router.get("/v1/futures/open-interest", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? normSym(String(req.query.symbol)) : null;
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
  // futures_positions has pair_id, not symbol — join via pairs table
  const [pair] = await db.select({ id: pairsTable.id }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
  if (!pair) { res.status(404).json({ error: "Pair not found" }); return; }
  const oi = await db.execute(sql`
    SELECT COALESCE(SUM(ABS(qty::float8)), 0) AS open_interest
    FROM futures_positions WHERE status = 'open' AND pair_id = ${pair.id}
  `);
  res.json({ symbol, openInterest: Number((oi as any).rows?.[0]?.open_interest ?? 0), ts: Date.now() });
});

router.get("/v1/futures/funding-rate", async (req, res): Promise<void> => {
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
  if (symbol) {
    const [pair] = await db.select({ baseFundingRate: pairsTable.baseFundingRate }).from(pairsTable).where(eq(pairsTable.symbol, symbol)).limit(1);
    res.json({ symbol, fundingRate: Number(pair?.baseFundingRate ?? 0.0001), ts: Date.now() });
    return;
  }
  const pairs = await db.select({ symbol: pairsTable.symbol, baseFundingRate: pairsTable.baseFundingRate }).from(pairsTable).where(eq(pairsTable.status, "active"));
  res.json({ rates: pairs.map((p) => ({ symbol: p.symbol, fundingRate: Number(p.baseFundingRate ?? 0.0001) })), ts: Date.now() });
});

router.get("/v1/futures/insurance-fund", (_req, res): void => {
  res.json({ balance: 0, currency: "USDT", ts: Date.now() });
});

router.get("/v1/futures/statistics", async (_req, res): Promise<void> => {
  const CK = "v1:futures:statistics";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const oi = await db.execute(sql`SELECT COUNT(*)::int AS open_count FROM futures_positions WHERE status = 'open'`);
  const payload = { openPositions: Number((oi as any).rows?.[0]?.open_count ?? 0), ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 30);
  res.json(payload);
});

router.get("/v1/futures/markets", async (_req, res): Promise<void> => {
  const pairs = await db.select().from(pairsTable).where(and(eq(pairsTable.status, "active"), eq(pairsTable.futuresEnabled, true)));
  const tickMap = new Map(getCache().map((t) => [t.symbol, t]));
  const enriched = pairs.map((p: any) => {
    const base = p.symbol.split("/")[0] ?? p.symbol;
    const tick = tickMap.get(base);
    return { ...p, lastPrice: Number(p.lastPrice ?? tick?.usdt ?? 0), change24h: tick?.change24h ?? 0 };
  });
  res.json({ markets: enriched, count: enriched.length, ts: Date.now() });
});

router.get("/v1/futures/leaderboard", async (_req, res): Promise<void> => {
  const CK = "v1:futures:leaderboard";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const top = await db.execute(sql`
    SELECT user_id, SUM(realized_pnl::float8) AS total_pnl, COUNT(*)::int AS closed_positions
    FROM futures_positions WHERE status = 'closed' AND realized_pnl::float8 > 0
    GROUP BY user_id ORDER BY total_pnl DESC LIMIT 20
  `);
  const payload = { leaderboard: (top as any).rows ?? [], ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 120);
  res.json(payload);
});

// ═══════════════════════════════════════════════════════════════════════════
// AI TRADING
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/ai/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.isActive, true)).orderBy(desc(aiTradingPlansTable.dailyReturnPercent));
  res.json({ plans, count: plans.length, ts: Date.now() });
});

router.get("/v1/ai/performance", async (_req, res): Promise<void> => {
  const stats = await db.execute(sql`
    SELECT AVG(daily_return_percent::float8) AS avg_daily, MAX(daily_return_percent::float8) AS max_daily,
           COUNT(*)::int AS plan_count FROM ai_trading_plans WHERE is_active = true
  `);
  const s = (stats as any).rows?.[0] ?? {};
  res.json({ avgDailyReturn: Number(s.avg_daily ?? 0), maxDailyReturn: Number(s.max_daily ?? 0), planCount: Number(s.plan_count ?? 0), ts: Date.now() });
});

router.get("/v1/ai/statistics", async (_req, res): Promise<void> => {
  const [plans, subs] = await Promise.all([
    db.select({ count: count() }).from(aiTradingPlansTable).where(eq(aiTradingPlansTable.isActive, true)),
    db.select({ count: count() }).from(aiTradingSubscriptionsTable).where(eq(aiTradingSubscriptionsTable.status, "active")),
  ]);
  res.json({ activePlans: plans[0]?.count ?? 0, activeSubscriptions: subs[0]?.count ?? 0, ts: Date.now() });
});

router.get("/v1/ai/live", async (_req, res): Promise<void> => {
  const [subs] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable).where(eq(aiTradingSubscriptionsTable.status, "active"));
  res.json({ liveSubscriptions: subs?.count ?? 0, status: "running", ts: Date.now() });
});

router.get("/v1/ai/strategies", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.isActive, true));
  const strategies = plans.map((p: any) => ({ id: p.id, name: p.name, riskLevel: p.riskLevel, dailyReturn: p.dailyReturnPercent, description: p.description }));
  res.json({ strategies, count: strategies.length, ts: Date.now() });
});

router.get("/v1/ai/leaderboard", async (_req, res): Promise<void> => {
  const CK = "v1:ai:leaderboard";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const top = await db.execute(sql`
    SELECT s.user_id, SUM(e.amount_usdt::float8) AS total_earnings, COUNT(e.id)::int AS earning_entries
    FROM ai_trading_subscriptions s
    JOIN ai_trading_earnings e ON e.subscription_id = s.id
    WHERE s.status = 'active'
    GROUP BY s.user_id ORDER BY total_earnings DESC LIMIT 20
  `);
  const payload = { leaderboard: (top as any).rows ?? [], ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 120);
  res.json(payload);
});

router.get("/v1/ai/top-performers", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.isActive, true)).orderBy(desc(aiTradingPlansTable.dailyReturnPercent)).limit(5);
  res.json({ topPerformers: plans, ts: Date.now() });
});

router.get("/v1/ai/roi", async (_req, res): Promise<void> => {
  const CK = "v1:ai:roi";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const stats = await db.execute(sql`SELECT AVG(daily_return_percent::float8) AS avg_daily FROM ai_trading_plans WHERE is_active = true`);
  const avg = Number((stats as any).rows?.[0]?.avg_daily ?? 0);
  const payload = { avgDailyRoi: avg, avg30dRoi: avg * 30, avg365dRoi: avg * 365, ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 300);
  res.json(payload);
});

router.get("/v1/ai/profit", async (_req, res): Promise<void> => {
  const CK = "v1:ai:profit";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const total = await db.execute(sql`SELECT SUM(amount_usdt::float8) AS total FROM ai_trading_earnings`);
  const payload = { totalProfit: Number((total as any).rows?.[0]?.total ?? 0), currency: "USDT", ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 120);
  res.json(payload);
});

router.get("/v1/ai/signals", (_req, res): void => {
  const ticks = getCache().slice(0, 10);
  const signals = ticks.map((t) => ({
    symbol: t.symbol,
    signal: t.change24h > 0 ? "buy" : "sell",
    strength: Math.min(Math.abs(t.change24h) / 10, 1),
    price: t.usdt,
    change24h: t.change24h,
    ts: t.ts,
  }));
  res.json({ signals, ts: Date.now() });
});

router.get("/v1/ai/backtest", (_req, res): void => {
  res.json({ status: "available", note: "Backtest simulation based on historical trade data", ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// EARN
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/earn/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(earnProductsTable).where(eq(earnProductsTable.status, "active")).orderBy(desc(earnProductsTable.apy));
  res.json({ plans, count: plans.length, ts: Date.now() });
});

router.get("/v1/earn/categories", async (_req, res): Promise<void> => {
  const rows = await db.select({ type: earnProductsTable.type }).from(earnProductsTable).where(eq(earnProductsTable.status, "active"));
  const categories = [...new Set(rows.map((r: any) => r.type))];
  res.json({ categories, count: categories.length, ts: Date.now() });
});

router.get("/v1/earn/products", async (_req, res): Promise<void> => {
  const products = await db.select().from(earnProductsTable).where(eq(earnProductsTable.status, "active")).orderBy(desc(earnProductsTable.apy));
  res.json({ products, count: products.length, ts: Date.now() });
});

router.get("/v1/earn/apy", async (_req, res): Promise<void> => {
  const products = await db
    .select({ id: earnProductsTable.id, name: earnProductsTable.name, coinId: earnProductsTable.coinId, apy: earnProductsTable.apy, type: earnProductsTable.type })
    .from(earnProductsTable)
    .where(eq(earnProductsTable.status, "active"))
    .orderBy(desc(earnProductsTable.apy));
  res.json({ apy: products, ts: Date.now() });
});

router.get("/v1/earn/statistics", async (_req, res): Promise<void> => {
  const stats = await db.execute(sql`
    SELECT COUNT(*)::int AS product_count, AVG(apy::float8) AS avg_apy, MAX(apy::float8) AS max_apy
    FROM earn_products WHERE status = 'active'
  `);
  const s = (stats as any).rows?.[0] ?? {};
  res.json({ productCount: Number(s.product_count ?? 0), avgApy: Number(s.avg_apy ?? 0), maxApy: Number(s.max_apy ?? 0), ts: Date.now() });
});

router.get("/v1/earn/featured", async (_req, res): Promise<void> => {
  const featured = await db.select().from(earnProductsTable).where(and(eq(earnProductsTable.status, "active"), eq(earnProductsTable.featured, true))).orderBy(desc(earnProductsTable.apy)).limit(6);
  const fallback = featured.length ? featured : await db.select().from(earnProductsTable).where(eq(earnProductsTable.status, "active")).orderBy(desc(earnProductsTable.apy)).limit(4);
  res.json({ featured: fallback, count: fallback.length, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/convert/quote", (req, res): void => {
  const from = req.query.from ? String(req.query.from).toUpperCase() : null;
  const to = req.query.to ? String(req.query.to).toUpperCase() : null;
  const amount = req.query.amount ? Number(req.query.amount) : null;
  if (!from || !to || !amount) { res.status(400).json({ error: "from, to, and amount required" }); return; }
  const ticks = getCache();
  const fromTick = ticks.find((t) => t.symbol === from);
  const toTick = ticks.find((t) => t.symbol === to);
  if (!fromTick || !toTick) { res.status(400).json({ error: "Unsupported symbol" }); return; }
  const fromUsd = fromTick.usdt * amount;
  const toAmount = toTick.usdt > 0 ? fromUsd / toTick.usdt : 0;
  const rate = toTick.usdt > 0 ? fromTick.usdt / toTick.usdt : 0;
  res.json({ from, to, fromAmount: amount, toAmount, rate, fee: fromUsd * 0.001, expiresAt: Date.now() + 30_000, ts: Date.now() });
});

router.get("/v1/convert/rates", (_req, res): void => {
  const ticks = getCache();
  const rates = ticks.map((t) => ({ symbol: t.symbol, rateUsd: t.usdt, rateInr: t.inr, ts: t.ts }));
  res.json({ rates, inrRate: getInrRate(), ts: Date.now() });
});

router.get("/v1/convert/supported", async (_req, res): Promise<void> => {
  const coins = await db.select({ symbol: coinsTable.symbol, name: coinsTable.name }).from(coinsTable).where(eq(coinsTable.isListed, true)).orderBy(coinsTable.symbol);
  res.json({ coins, count: coins.length, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// REFERRAL
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/referral/info", async (_req, res): Promise<void> => {
  const raw = await getSetting("referral.config");
  let config: any = { rewardPercent: 20, minTradeUsd: 10, maxRewardUsd: 1000 };
  try { if (raw) config = JSON.parse(raw); } catch {}
  res.json({ referralProgram: config, ts: Date.now() });
});

router.get("/v1/referral/rules", (_req, res): void => {
  res.json({
    rules: [
      "Refer a friend and earn commission on every trade they make.",
      "Commission is credited to your spot wallet instantly.",
      "No limit on the number of referrals you can make.",
      "Referral rewards apply to spot trading fees only.",
    ],
    commissionRate: "20%",
    ts: Date.now(),
  });
});

router.get("/v1/referral/rewards", (_req, res): void => {
  res.json({ rewards: [], note: "Authentication required for personal referral rewards", ts: Date.now() });
});

router.get("/v1/referral/statistics", async (_req, res): Promise<void> => {
  const [row] = await db.select({ count: count() }).from(referralsTable);
  res.json({ totalReferrals: row?.count ?? 0, ts: Date.now() });
});

router.get("/v1/referral/campaigns", (_req, res): void => {
  res.json({
    campaigns: [{ id: 1, name: "Standard Referral", commissionPct: 20, status: "active", startDate: null, endDate: null }],
    ts: Date.now(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS / NEWS / CMS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/announcements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).where(eq(announcementsTable.isPublished, true)).orderBy(desc(announcementsTable.publishedAt)).limit(20);
  res.json({ announcements: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/news", async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsItemsTable).where(eq(newsItemsTable.isPublished, true)).orderBy(desc(newsItemsTable.publishedAt)).limit(20);
  res.json({ news: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/blog", async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsItemsTable).where(eq(newsItemsTable.isPublished, true)).orderBy(desc(newsItemsTable.publishedAt)).limit(10);
  res.json({ posts: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/events", async (_req, res): Promise<void> => {
  const rows = await db.select().from(competitionsTable).where(eq(competitionsTable.status, "active")).orderBy(asc(competitionsTable.endsAt)).limit(10);
  res.json({ events: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/notices", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).where(eq(announcementsTable.isPublished, true)).orderBy(desc(announcementsTable.publishedAt)).limit(10);
  res.json({ notices: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/promotions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(promotionsTable).where(eq(promotionsTable.isActive, true)).orderBy(asc(promotionsTable.position)).limit(20);
  res.json({ promotions: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/updates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).where(eq(announcementsTable.isPublished, true)).orderBy(desc(announcementsTable.publishedAt)).limit(10);
  res.json({ updates: rows, count: rows.length, ts: Date.now() });
});

// ── CMS ─────────────────────────────────────────────────────────────────────

router.get("/v1/banners", async (_req, res): Promise<void> => {
  const rows = await db.select().from(bannersTable).where(eq(bannersTable.isActive, true)).orderBy(asc(bannersTable.position));
  res.json({ banners: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/sliders", async (_req, res): Promise<void> => {
  const rows = await db.select().from(bannersTable).where(eq(bannersTable.isActive, true)).orderBy(asc(bannersTable.position));
  res.json({ sliders: rows, count: rows.length, ts: Date.now() });
});

router.get("/v1/homepage", async (_req, res): Promise<void> => {
  const [banners, promotions, announcements, brand] = await Promise.all([
    db.select().from(bannersTable).where(eq(bannersTable.isActive, true)).orderBy(asc(bannersTable.position)).limit(6),
    db.select().from(promotionsTable).where(eq(promotionsTable.isActive, true)).limit(4),
    db.select().from(announcementsTable).where(eq(announcementsTable.isPublished, true)).orderBy(desc(announcementsTable.publishedAt)).limit(5),
    getSetting("site.brand"),
  ]);
  let brandObj: any = {};
  try { if (brand) brandObj = JSON.parse(brand); } catch {}
  res.json({ brand: brandObj, banners, promotions, announcements, ts: Date.now() });
});

router.get("/v1/faqs", (_req, res): void => {
  res.json({ faqs: [], note: "FAQ content managed via admin CMS", ts: Date.now() });
});

router.get("/v1/support/articles", (_req, res): void => {
  res.json({ articles: [], note: "Support articles managed via admin CMS", ts: Date.now() });
});

router.get("/v1/pages", async (_req, res): Promise<void> => {
  // legalPagesTable PK is slug; no id or created_at columns
  const pages = await db.select({ slug: legalPagesTable.slug, title: legalPagesTable.title, updatedAt: legalPagesTable.updatedAt }).from(legalPagesTable).orderBy(legalPagesTable.slug);
  res.json({ pages, count: pages.length, ts: Date.now() });
});

router.get("/v1/company", async (_req, res): Promise<void> => {
  const brand = await getSetting("site.brand");
  let brandObj: any = { name: "Zebvix", tagline: "", supportEmail: "support@zebvix.com" };
  try { if (brand) brandObj = { ...brandObj, ...JSON.parse(brand) }; } catch {}
  res.json({ company: brandObj, ts: Date.now() });
});

router.get("/v1/social-links", async (_req, res): Promise<void> => {
  const raw = await getSetting("site.social");
  let social: any = {};
  try { if (raw) social = JSON.parse(raw); } catch {}
  res.json({ social, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

router.get("/v1/statistics", async (_req, res): Promise<void> => {
  const [uRows, tRows, pRows] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(tradesTable),
    db.select({ count: count() }).from(pairsTable).where(eq(pairsTable.status, "active")),
  ]);
  const ticks = getCache();
  const totalVol = ticks.reduce((s, t) => s + t.volume24h, 0);
  res.json({
    users: uRows[0]?.count ?? 0,
    trades: tRows[0]?.count ?? 0,
    activePairs: pRows[0]?.count ?? 0,
    totalVolume24hUsd: totalVol,
    inrRate: getInrRate(),
    ts: Date.now(),
  });
});

router.get("/v1/global", (_req, res): void => {
  const ticks = getCache();
  const totalVol = ticks.reduce((s, t) => s + t.volume24h, 0);
  const gainers = ticks.filter((t) => t.change24h > 0).length;
  res.json({ totalVolume24hUsd: totalVol, coinCount: ticks.length, gainers, inrRate: getInrRate(), ts: Date.now() });
});

router.get("/v1/exchange-volume", async (_req, res): Promise<void> => {
  const CK = "v1:exchange-volume";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const since = new Date(Date.now() - 86_400_000);
  const vol = await db.execute(sql`SELECT SUM(price::float8 * qty::float8) AS quote_volume FROM trades WHERE created_at >= ${since} AND is_taker = 1`);
  const quoteVol = Number((vol as any).rows?.[0]?.quote_volume ?? 0);
  const payload = { volume24hUsd: quoteVol, volume24hInr: quoteVol * getInrRate(), ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 60);
  res.json(payload);
});

router.get("/v1/trading-volume", async (_req, res): Promise<void> => {
  const CK = "v1:trading-volume";
  const hit = await rGet(CK);
  if (hit) { res.json(JSON.parse(hit)); return; }
  const since = new Date(Date.now() - 86_400_000);
  const vol = await db.execute(sql`
    SELECT SUM(qty::float8) AS base_volume, SUM(price::float8 * qty::float8) AS quote_volume
    FROM trades WHERE created_at >= ${since} AND is_taker = 1
  `);
  const v = (vol as any).rows?.[0] ?? {};
  const payload = { baseVolume24h: Number(v.base_volume ?? 0), quoteVolume24h: Number(v.quote_volume ?? 0), ts: Date.now() };
  void rSet(CK, JSON.stringify(payload), 60);
  res.json(payload);
});

router.get("/v1/users", async (_req, res): Promise<void> => {
  const [row] = await db.select({ count: count() }).from(usersTable);
  res.json({ totalUsers: row?.count ?? 0, ts: Date.now() });
});

router.get("/v1/liquidity", async (_req, res): Promise<void> => {
  const CACHE_KEY = "v1:liquidity";
  const cached = await rGet(CACHE_KEY);
  if (cached) { res.json(JSON.parse(cached)); return; }
  const [bids, asks] = await Promise.all([
    db.execute(sql`SELECT SUM(price::float8 * (qty - filled_qty)::float8) AS bid_liq FROM orders WHERE side = 'buy' AND status IN ('open','partial') AND type IN ('limit','post_only') AND is_bot = 0`),
    db.execute(sql`SELECT SUM(price::float8 * (qty - filled_qty)::float8) AS ask_liq FROM orders WHERE side = 'sell' AND status IN ('open','partial') AND type IN ('limit','post_only') AND is_bot = 0`),
  ]);
  const payload = {
    totalBidLiquidity: Number((bids as any).rows?.[0]?.bid_liq ?? 0),
    totalAskLiquidity: Number((asks as any).rows?.[0]?.ask_liq ?? 0),
    ts: Date.now(),
  };
  void rSet(CACHE_KEY, JSON.stringify(payload), 30);
  res.json(payload);
});

router.get("/v1/market-cap", (_req, res): void => {
  const ticks = getCache();
  res.json({ coinCount: ticks.length, note: "Market cap data not tracked", ts: Date.now() });
});

router.get("/v1/top-coins", (_req, res): void => {
  const sorted = [...getCache()].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  res.json({ coins: sorted.map((t) => ({ symbol: t.symbol, priceUsd: t.usdt, priceInr: t.inr, change24h: t.change24h, volume24h: t.volume24h })), ts: Date.now() });
});

router.get("/v1/top-volume", (_req, res): void => {
  const sorted = [...getCache()].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  res.json({ coins: sorted.map((t) => ({ symbol: t.symbol, priceUsd: t.usdt, volume24h: t.volume24h })), ts: Date.now() });
});

router.get("/v1/platform", async (_req, res): Promise<void> => {
  const [uRows, tRows] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(tradesTable),
  ]);
  res.json({
    name: "Zebvix",
    users: uRows[0]?.count ?? 0,
    trades: tRows[0]?.count ?? 0,
    coins: getCache().length,
    inrRate: getInrRate(),
    uptime: Math.floor(process.uptime()),
    ts: Date.now(),
  });
});

export default router;
