import http from "node:http";
import { WebSocketServer } from "ws";
// NOTE: `app` is imported dynamically inside bootstrap() AFTER initRedis().
// app.ts constructs RedisStore (rate-limit-redis) at module load time, and
// that constructor calls SCRIPT LOAD on the redis client, so the client must
// already be connected. Keeping a static `import` here would crash boot.
import { logger } from "./lib/logger";
import { incWsClients, decWsClients } from "./lib/ws-state";
import { startPriceService, getCache, subscribe, getInrRate } from "./lib/price-service";
import { startBotService } from "./lib/bot-service";
import { startFuturesBotService } from "./lib/futures-bot-service";
import { startDepositSweeper } from "./lib/deposit-sweeper";
import { startWithdrawalWatcher } from "./lib/withdrawal-watcher";
import { startAutoWithdrawScheduler } from "./lib/auto-withdraw-scheduler";
import { startFuturesEngine } from "./lib/futures-engine";
import { startOptionsEngine } from "./lib/options-engine";
import { startOptionsDailyCreator } from "./lib/options-daily-creator";
import { startListingDiscovery } from "./lib/listing-discovery";
import { startPriceAlertWorker } from "./lib/notifications";
import { startBotEngine } from "./lib/bot-engine";
import { startEarnEngine } from "./lib/earn-engine";
import { startStopOrderEngine } from "./lib/stop-order-engine";
import { startP2PEngine } from "./lib/p2p-engine";
import { startAICreditEngine } from "./lib/ai-credit-engine";
import { startAutoInvestEngine } from "./lib/auto-invest-engine";
import { restoreBooksOnBoot } from "./routes/futures";
import { onFuturesOrderbook, getLastFuturesDepth, startFuturesBridge, isFuturesPair, getPairIdBySymbol } from "./lib/futures-ws-bridge";
import { initRedis, shutdownRedis } from "./lib/redis";
import { seedCacheConfigs } from "./routes/redis-admin";
import { warmAllCaches, startWarmupRefresh } from "./lib/cache-warmup";
import { startPairStatsService } from "./lib/pair-stats";
import { startPriceHistory } from "./lib/price-history";
import { getPairStats } from "./lib/pair-stats";
import { isAllowedInterval } from "./lib/ohlcv-cache";
import { startLeaderElection, stopLeaderElection, isLeader, INSTANCE_ID } from "./lib/leader";
import { startWsFanout } from "./lib/ws-fanout";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ─── Production startup security checks ──────────────────────────────────
if (process.env["NODE_ENV"] === "production") {
  const sessionSecret = process.env["SESSION_SECRET"] ?? "";
  if (sessionSecret.length < 32) {
    logger.warn(
      { len: sessionSecret.length },
      "SESSION_SECRET is too short for production — use `openssl rand -hex 64` to generate a strong secret.",
    );
  }
  if (!process.env["CORS_ORIGINS"]) {
    // getAllowedOrigins() in app.ts will throw — this just surfaces it earlier.
    logger.warn("CORS_ORIGINS is not set — app.ts will refuse to start in production without it.");
  }
}

// Flutter UI hits several historical Bicrypto WS paths. Rather than create
// one WSS per path (each binds the upgrade handler), we attach one WSS with
// `noServer:true` and route HTTP `upgrade` events to it for each known path.
const PRICE_WS_PATHS = [
  "/api/ws/prices",          // current canonical
  "/api/exchange/ticker",    // Flutter spot exchange page
  "/api/exchange/ws",        // Flutter generic market socket
  "/api/exchange/market",    // Flutter trading_websocket_service
  "/api/futures/ws",         // Flutter futures page (price stream only for now)
  "/api/ws/exchange",        // additional alias seen in some Bicrypto builds
  "/ws",                     // public: subscribe via messages  wss://domain/ws
  "/stream",                 // public: combined streams        wss://domain/stream?streams=...
];
const wss = new WebSocketServer({ noServer: true });

// ─── Binance-compatible stream URL helpers ────────────────────────────────────

/**
 * Parse stream names from Binance-style WebSocket URL.
 *   /ws/btcusdt@ticker              → ["btcusdt@ticker"]
 *   /ws/btcusdt@depth20             → ["btcusdt@depth20"]
 *   /ws/btcusdt@kline_1m            → ["btcusdt@kline_1m"]
 *   /stream?streams=s1/s2           → ["s1", "s2"]
 *   /ws  (no suffix)                → []  (subscribe via messages)
 */
function parseStreamsFromUrl(rawUrl: string): string[] {
  const [path, query] = (rawUrl ?? "").split("?");
  const streams: string[] = [];
  // /ws/<streamName> or /ws/<s1>+<s2>
  if (path.startsWith("/ws/") && path.length > 4) {
    const part = decodeURIComponent(path.slice(4));
    streams.push(...part.split("+").filter(Boolean));
  }
  // /stream?streams=s1/s2/s3
  if (path === "/stream" && query) {
    const sp = new URLSearchParams(query).get("streams") ?? "";
    streams.push(...sp.split("/").filter(Boolean));
  }
  return streams;
}

/** Convert Binance-style lowercase symbol to exchange format.
 *  "btcusdt" → "BTC/USDT"   "ethinr" → "ETH/INR"
 */
function binanceSymToExchange(raw: string): string {
  const s = raw.toUpperCase();
  for (const q of ["USDT", "INR", "BTC", "ETH", "BNB"]) {
    if (s.endsWith(q) && s.length > q.length) return `${s.slice(0, -q.length)}/${q}`;
  }
  return s;
}

/** Convert exchange pair symbol to Binance-style stream key.
 *  "BTC/USDT", "ticker" → "btcusdt@ticker"
 */
function toBinanceStream(sym: string, type: string): string {
  return sym.replace("/", "").toLowerCase() + "@" + type;
}

type SubsState = {
  tickerSymbols: Set<string>;
  orderbookSymbols: Map<string, number>;
  tradesSymbols: Set<string>;
  futuresTradesSymbols: Set<string>;
  ohlcvSymbols: Map<string, Set<string>>;
  futuresOBSymbols: Set<string>;
};

/** Apply subscriptions from parsed Binance-style stream names. */
function autoSubscribeStreams(streams: string[], subs: SubsState): void {
  for (const s of streams) {
    const at = s.indexOf("@");
    if (at < 1) continue;
    const rawSym = s.slice(0, at);
    const streamType = s.slice(at + 1);
    const symbol = binanceSymToExchange(rawSym);

    if (
      streamType === "ticker" ||
      streamType === "miniTicker" ||
      streamType === "24hrTicker" ||
      streamType === "bookTicker"
    ) {
      subs.tickerSymbols.add(symbol);
    } else if (streamType.startsWith("depth")) {
      const lvl = parseInt(streamType.slice(5)) || 20;
      subs.orderbookSymbols.set(symbol, Math.min(lvl, 100));
    } else if (streamType === "trade" || streamType === "aggTrade") {
      if (isFuturesPair(symbol)) subs.futuresTradesSymbols.add(symbol);
      else subs.tradesSymbols.add(symbol);
    } else if (streamType.startsWith("kline_")) {
      const interval = streamType.slice(6); // "1m","5m","1h",...
      if (isAllowedInterval(interval)) {
        if (!subs.ohlcvSymbols.has(symbol)) subs.ohlcvSymbols.set(symbol, new Set());
        subs.ohlcvSymbols.get(symbol)!.add(interval);
      }
    }
  }
}

// Convert internal Tick[] → Bicrypto-style ticker map keyed by "BASE/QUOTE".
// Emits both BASE/USDT and BASE/INR entries so the Flutter MarketService
// (which keys cachedMarkets by full symbol) can match either pair.
function toTickersFrame(ticks: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const t of ticks) {
    if (!t || !t.symbol) continue;
    if (t.symbol === "USDT" || t.symbol === "INR") continue;
    const usdt = Number(t.usdt ?? 0);
    const inr = Number(t.inr ?? 0);
    const pctRawTick = Number(t.change24h ?? 0);
    const tickVol = Number(t.volume24h ?? 0);
    const build = (sym: string, feedPx: number) => {
      // Overlay authoritative DB pair-stats (volume / change / hi-lo / last)
      // when the pair has any real fills. Falls back to the synthetic
      // external-feed tick when the pair has never traded.
      const ps = getPairStats(sym);
      const hasFills = !!ps && ps.trades24h > 0;
      const px = hasFills ? (ps!.lastPrice || feedPx) : feedPx;
      const pctRaw = hasFills ? ps!.change24h : pctRawTick;
      const pct = pctRaw <= -100 ? -99.99 : pctRaw;
      const baseVol = hasFills ? ps!.baseVolume : tickVol;
      const quoteVol = hasFills ? ps!.quoteVolume : baseVol * px;
      const high = hasFills ? (ps!.high24h || px) : px * (1 + Math.max(pct, 0) / 100);
      const low = hasFills ? (ps!.low24h || px) : px * (1 + Math.min(pct, 0) / 100);
      return {
        last: px, change: pct, baseVolume: baseVol, quoteVolume: quoteVol,
        high, low, timestamp: Number(t.ts ?? Date.now()),
      };
    };
    if (usdt > 0) out[`${t.symbol}/USDT`] = build(`${t.symbol}/USDT`, usdt);
    if (inr > 0) out[`${t.symbol}/INR`] = build(`${t.symbol}/INR`, inr);
  }
  return out;
}

// Build a per-symbol ticker frame matching what TradingWebSocketService
// (._handleTickerData) expects: keys symbol/last/bid/ask/high/low/open/close/
// percentage/baseVolume/quoteVolume.
function tickerFrameFor(symbol: string, ticks: any[]) {
  const [base, quote = "USDT"] = symbol.split("/");
  const t = ticks.find((x) => x && x.symbol === base);
  if (!t) return null;
  const feedPx = quote === "INR" ? Number(t.inr ?? 0) : Number(t.usdt ?? 0);
  const ps = getPairStats(symbol);
  const hasFills = !!ps && ps.trades24h > 0;
  const px = hasFills ? (ps!.lastPrice || feedPx) : feedPx;
  if (!(px > 0)) return null;
  const pctRaw = hasFills ? ps!.change24h : Number(t.change24h ?? 0);
  const pct = pctRaw <= -100 ? -99.99 : pctRaw;
  const baseVol = hasFills ? ps!.baseVolume : Number(t.volume24h ?? 0);
  const quoteVol = hasFills ? ps!.quoteVolume : baseVol * px;
  const high = hasFills ? (ps!.high24h || px) : px * (1 + Math.max(pct, 0) / 100);
  const low = hasFills ? (ps!.low24h || px) : px * (1 + Math.min(pct, 0) / 100);
  return {
    symbol,
    last: px,
    bid: px,
    ask: px,
    high, low,
    open: px / (1 + pct / 100),
    close: px,
    percentage: pct,
    baseVolume: baseVol,
    quoteVolume: quoteVol,
    timestamp: Number(t.ts ?? Date.now()),
  };
}

wss.on("connection", (ws, req: any) => {
  // Per-connection subscription state. Trading widgets in Flutter send
  //   {action:"SUBSCRIBE", payload:{type:"orderbook"|"trades"|"ticker", symbol, limit}}
  // We track subscribed symbols per type and push fresh data on each price
  // tick (orderbook/trades are pulled from Redis via the matching engine).
  const subs: SubsState = {
    tickerSymbols: new Set(),
    orderbookSymbols: new Map(),
    tradesSymbols: new Set(),
    futuresTradesSymbols: new Set(),
    ohlcvSymbols: new Map(),
    futuresOBSymbols: new Set(),
  };

  // ── Binance-style URL auto-subscribe ──────────────────────────────────────
  // When a client connects to /ws/btcusdt@ticker or /stream?streams=s1/s2
  // we parse the stream names from the URL and pre-populate subs so the
  // client receives data immediately without sending any SUBSCRIBE message.
  const urlStreams = parseStreamsFromUrl(req?.url ?? "");
  if (urlStreams.length > 0) {
    autoSubscribeStreams(urlStreams, subs);
  }
  // Throttle OHLCV pushes — buildChart hits the DB. 2s gives a smooth
  // "breathing" chart without hammering Postgres on every 1s price tick.
  // The shared ohlcv-cache further dedupes work across all connections.
  let lastOhlcvPushTs = 0;
  let ohlcvPushInflight = false;
  let ohlcvPushDirty = false;
  // Cap to prevent abuse: one connection cannot subscribe to unbounded
  // (symbol, interval) pairs.
  const MAX_OHLCV_SUBS = 12;

  const safeSend = (payload: any) => {
    try {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
    } catch {}
  };

  // Relay futures orderbook updates from the Go engine bridge to this client.
  const unsubFuturesBridge = onFuturesOrderbook((sym, data) => {
    if (!subs.futuresOBSymbols.has(sym)) return;
    safeSend({ stream: `futures.orderbook:${sym}`, data });
  });

  // Per-connection cache for futures trade snapshots (2 s TTL) to avoid
  // hitting Postgres on every 1s price tick per subscribed pair.
  const futuresTradesCache = new Map<string, { ts: number; data: any[] }>();
  const FUTURES_TRADES_TTL = 800;

  // Push orderbook + trades for all subscribed symbols. Async so Redis I/O
  // doesn't block the price-tick loop.
  const pushBookAndTrades = async () => {
    const hasWork =
      subs.orderbookSymbols.size > 0 ||
      subs.tradesSymbols.size > 0 ||
      subs.futuresTradesSymbols.size > 0;
    if (!hasWork) return;
    try {
      const me = await import("./lib/matching-engine");
      for (const [sym, lim] of subs.orderbookSymbols) {
        try {
          const depth = await me.getDepth(sym, lim);
          const payload = { ...depth, symbol: sym, timestamp: Date.now() };
          safeSend({ stream: `orderbook:${sym}`, data: payload });
          safeSend({ stream: toBinanceStream(sym, `depth${lim}`), data: payload });
          safeSend({ stream: toBinanceStream(sym, "depth"), data: payload });
        } catch {}
      }
      // Spot trades — served from in-memory Redis matching engine.
      for (const sym of subs.tradesSymbols) {
        try {
          const trades = await me.getRecentTrades(sym, 50);
          safeSend({ stream: `trades:${sym}`, data: trades, symbol: sym });
          safeSend({ stream: toBinanceStream(sym, "trade"), data: trades, symbol: sym });
          safeSend({ stream: toBinanceStream(sym, "aggTrade"), data: trades, symbol: sym });
        } catch {}
      }
      // Futures trades — served from futuresTradesTable (not the spot engine).
      if (subs.futuresTradesSymbols.size > 0) {
        const { db, futuresTradesTable } = await import("@workspace/db");
        const { eq, desc, and } = await import("drizzle-orm");
        for (const sym of subs.futuresTradesSymbols) {
          try {
            const cached = futuresTradesCache.get(sym);
            if (cached && Date.now() - cached.ts < FUTURES_TRADES_TTL) {
              safeSend({ stream: `trades:${sym}`, data: cached.data, symbol: sym });
              continue;
            }
            const pairId = getPairIdBySymbol(sym);
            if (!pairId) continue;
            const rows = await db.select({
              id:        futuresTradesTable.id,
              price:     futuresTradesTable.price,
              qty:       futuresTradesTable.qty,
              takerSide: futuresTradesTable.takerSide,
              createdAt: futuresTradesTable.createdAt,
            }).from(futuresTradesTable)
              .where(and(
                eq(futuresTradesTable.pairId, pairId),
              ))
              .orderBy(desc(futuresTradesTable.createdAt))
              .limit(50);
            const data = rows.map(r => ({
              price: Number(r.price),
              qty:   Number(r.qty),
              side:  r.takerSide,
              ts:    new Date(r.createdAt).getTime(),
            }));
            futuresTradesCache.set(sym, { ts: Date.now(), data });
            safeSend({ stream: `trades:${sym}`, data, symbol: sym });
          } catch {}
        }
      }
    } catch {}
  };

  // Push fresh OHLCV candles for each (symbol, interval) the client is
  // watching. Throttled to ~2s. Frame matches Bicrypto/Flutter contract:
  //   { stream: "ohlcv:SOL/INR:1h", data: [[ts,o,h,l,c,v], ...] }
  // The latest bucket always carries the live price so the chart breathes.
  const pushOhlcv = async (force = false) => {
    if (subs.ohlcvSymbols.size === 0) return;
    const now = Date.now();
    if (!force && now - lastOhlcvPushTs < 1000) return;
    // In-flight coalescing: if a push is already running, mark dirty and
    // re-run once it completes. Prevents overlapping DB-bound work when
    // buildChart latency exceeds the throttle window.
    if (ohlcvPushInflight) { ohlcvPushDirty = true; return; }
    ohlcvPushInflight = true;
    lastOhlcvPushTs = now;
    try {
      const { getOhlcv } = await import("./lib/ohlcv-cache");
      // Fetch all subscribed (symbol, interval) frames in parallel via the
      // shared cache (deduped across connections, so cost is O(unique pairs)).
      const tasks: Promise<void>[] = [];
      for (const [sym, intervals] of subs.ohlcvSymbols) {
        for (const interval of intervals) {
          tasks.push(
            getOhlcv(sym, interval, 200)
              .then((candles) => {
                safeSend({ stream: `ohlcv:${sym}:${interval}`, data: candles });
                safeSend({ stream: toBinanceStream(sym, `kline_${interval}`), data: candles });
              })
              .catch((err) => {
                logger.warn({ sym, interval, err: String(err) }, "ohlcv push failed");
              }),
          );
        }
      }
      await Promise.all(tasks);
    } finally {
      ohlcvPushInflight = false;
      if (ohlcvPushDirty) {
        ohlcvPushDirty = false;
        // Reset throttle so the dirty rerun fires immediately.
        lastOhlcvPushTs = 0;
        void pushOhlcv();
      }
    }
  };

  // Initial snapshot (legacy + Bicrypto-style bulk tickers).
  try {
    const ticks = getCache();
    ws.send(JSON.stringify({ type: "snapshot", inrRate: getInrRate(), ticks }));
    ws.send(JSON.stringify({ stream: "tickers", data: toTickersFrame(ticks) }));
  } catch {}

  const unsub = subscribe((ticks) => {
    safeSend({ type: "tick", inrRate: getInrRate(), ticks });
    safeSend({ stream: "tickers", data: toTickersFrame(ticks) });
    // Per-symbol ticker frames — sent with both legacy key ("ticker") and
    // Binance-compatible key ("btcusdt@ticker") so all client types work.
    for (const sym of subs.tickerSymbols) {
      const frame = tickerFrameFor(sym, ticks);
      if (frame) {
        safeSend({ stream: "ticker", data: frame });
        safeSend({ stream: toBinanceStream(sym, "ticker"), data: frame });
        safeSend({ stream: toBinanceStream(sym, "miniTicker"), data: frame });
      }
    }
    // Fire-and-forget orderbook/trades push (do not await — keep tick loop tight).
    void pushBookAndTrades();
    void pushOhlcv();
  });

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.action === "PING") { safeSend({ action: "PONG", ts: Date.now() }); return; }
    const isSub = msg.action === "SUBSCRIBE";
    const isUnsub = msg.action === "UNSUBSCRIBE";
    if (!isSub && !isUnsub) return;
    const p = msg.payload || {};
    const type = String(p.type || "");
    const symbol = String(p.symbol || "");
    if (!type || !symbol) return;
    if (type === "ticker") {
      if (isSub) subs.tickerSymbols.add(symbol);
      else subs.tickerSymbols.delete(symbol);
      // Send an immediate frame so the UI doesn't wait for the next tick.
      if (isSub) {
        const frame = tickerFrameFor(symbol, getCache());
        if (frame) safeSend({ stream: "ticker", data: frame });
      }
    } else if (type === "orderbook") {
      const lim = Math.max(1, Math.min(200, Number(p.limit) || 50));
      if (isSub) subs.orderbookSymbols.set(symbol, lim);
      else subs.orderbookSymbols.delete(symbol);
      if (isSub) void pushBookAndTrades();
    } else if (type === "trades") {
      // Route futures pairs to a separate set so they are served from
      // futuresTradesTable instead of the spot in-memory matching engine.
      if (isFuturesPair(symbol)) {
        if (isSub) subs.futuresTradesSymbols.add(symbol);
        else subs.futuresTradesSymbols.delete(symbol);
      } else {
        if (isSub) subs.tradesSymbols.add(symbol);
        else subs.tradesSymbols.delete(symbol);
      }
      if (isSub) void pushBookAndTrades();
    } else if (type === "ohlcv") {
      const interval = String(p.interval || "1h");
      // Reject unknown intervals upfront so a misbehaving client cannot
      // force the cache key space to grow without bound.
      if (!isAllowedInterval(interval)) return;
      if (isSub) {
        // Per-connection cap.
        let total = 0;
        for (const s of subs.ohlcvSymbols.values()) total += s.size;
        if (total >= MAX_OHLCV_SUBS) return;
        let set = subs.ohlcvSymbols.get(symbol);
        if (!set) { set = new Set(); subs.ohlcvSymbols.set(symbol, set); }
        set.add(interval);
        // Send an immediate snapshot bypassing the throttle so the chart
        // renders the moment the user opens it.
        void pushOhlcv(true);
      } else {
        const set = subs.ohlcvSymbols.get(symbol);
        if (set) {
          set.delete(interval);
          if (set.size === 0) subs.ohlcvSymbols.delete(symbol);
        }
      }
    } else if (type === "futures.orderbook") {
      if (isSub) {
        subs.futuresOBSymbols.add(symbol);
        // Immediately seed the subscriber with the last-known depth so they
        // don't stare at an empty book until the next matching-engine event.
        const snap = getLastFuturesDepth(symbol);
        if (snap) safeSend({ stream: `futures.orderbook:${symbol}`, data: snap });
      } else {
        subs.futuresOBSymbols.delete(symbol);
      }
    }
  });

  incWsClients();
  ws.on("close", () => { decWsClients(); unsub(); unsubFuturesBridge(); });
  ws.on("error", () => { decWsClients(); unsub(); unsubFuturesBridge(); });
});

// Bootstrap order matters for multi-server safety:
//   1. initRedis()           — required by RedisStore (rate-limit-redis) at
//                              module-load time of `./app`, by leader.ts, and
//                              by ws-fanout.ts.
//   2. startLeaderElection() — must complete first heartbeat BEFORE workers
//                              tick, so isLeader() returns the right value
//                              on tick #1 of every gated worker.
//   3. startWsFanout()       — followers subscribe to "prices.tick" so they
//                              can serve their connected WS clients with
//                              data fetched by the leader.
//   4. dynamic import("./app") — safe now that Redis is up.
//   5. http server + worker startup.
async function bootstrap() {
  // Best-effort Redis connect. If it fails, we boot in degraded mode:
  //   - app.ts makeStore() returns undefined  → MemoryStore rate-limit (per-process).
  //   - leader.ts isLeader() returns LEADER_SINGLE_INSTANCE_FALLBACK
  //     (default true in dev / false in prod) → workers paused or sole-leader.
  //   - ws-fanout.ts subscribe() no-ops, leader serves its own WS clients.
  // This keeps single-replica/dev usable when redis-server fails to spawn,
  // while production multi-replica deployments are protected by the env
  // default of fallback=false (no replica self-promotes).
  try {
    await initRedis();
  } catch (err: any) {
    logger.warn(
      { err: err?.message || String(err) },
      "[bootstrap] Redis init failed — running in degraded (no-Redis) mode",
    );
  }
  await startLeaderElection();
  await startWsFanout();
  await startFuturesBridge();

  const { default: app } = await import("./app");
  const server = http.createServer(app);

  server.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    const path = url.split("?")[0];
    // Accept:
    //   1. Exact path matches (existing Flutter/Bicrypto paths)
    //   2. /ws/<streamName>  — Binance-style single stream
    //   3. /stream           — Binance-style combined streams (?streams=...)
    const isWsPath =
      PRICE_WS_PATHS.includes(path) ||
      path.startsWith("/ws/") ||
      path.startsWith("/api/ws/");
    if (isWsPath) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });

  server.listen(port, async () => {
    logger.info({ port, instanceId: INSTANCE_ID, wsPaths: PRICE_WS_PATHS }, "Server listening (HTTP + price WS aliases)");
    try { await seedCacheConfigs(); } catch (e: any) { logger.warn({ err: e?.message }, "cache config seed failed"); }
    // Cache warmup: only the leader does the initial DB-heavy populate;
    // followers read the same Redis on demand.
    if (isLeader()) {
      try { await warmAllCaches(); } catch (e: any) { logger.warn({ err: e?.message }, "cache warmup failed"); }
    }
    // All start* calls are safe to invoke on every replica — internal tick
    // bodies are leader-gated. We start them here so leadership hand-overs
    // (e.g. after a leader crash + new election) take effect on the next
    // heartbeat without needing a workflow restart.
    startWarmupRefresh(60000);
    startPriceService(1000);
    startPriceHistory();
    startBotService(3000);
    startFuturesBotService(8000);
    startDepositSweeper(30000);
    startWithdrawalWatcher();
    startAutoWithdrawScheduler(60000);
    startFuturesEngine();
    startOptionsEngine();
    startOptionsDailyCreator();
    startListingDiscovery();
    startPriceAlertWorker();
    startBotEngine();
    startEarnEngine();
    startAutoInvestEngine();
    startStopOrderEngine();
    startP2PEngine();
    startAICreditEngine();
    // Re-seed the Go matching engine's in-memory book from any open futures
    // limit orders left over from the last run. ONLY the leader does this —
    // restoring on every replica would queue duplicate work into the same
    // shared Go engine.
    if (isLeader()) {
      void restoreBooksOnBoot();
    }
    startPairStatsService(5000);
    logger.info({ instanceId: INSTANCE_ID, leader: isLeader() }, "Multi-server workers started");
  });
}

const shutdown = async () => {
  await stopLeaderElection();
  await shutdownRedis();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason: String(reason) }, "Unhandled promise rejection — exiting");
  process.exit(1);
});
process.on("uncaughtException", (err: Error) => {
  logger.error({ err: err.message, stack: err.stack }, "Uncaught exception — exiting");
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error({ err: err?.stack || String(err) }, "fatal: bootstrap failed");
  process.exit(1);
});
