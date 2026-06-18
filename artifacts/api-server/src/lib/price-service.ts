import { db, coinsTable, pairsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { rSet, rPublish, rHset } from "./redis";
import { isLeader, INSTANCE_ID } from "./leader";
import { getPairStats } from "./pair-stats";

type Tick = { symbol: string; usdt: number; inr: number; change24h: number; volume24h: number; ts: number };

const cache = new Map<string, Tick>();
let inrRate = 84;
const subscribers = new Set<(ticks: Tick[]) => void>();

// Display-only jitter: CoinGecko caches values ~60s, so without jitter the live
// feed broadcasts identical numbers and the UI's price-flash never fires.
// IMPORTANT: jitter is applied ONLY at the WS boundary (getCache + broadcast).
// `cache`, DB, Redis, pair.lastPrice, order matching, and futures risk all see
// authoritative real prices — never jittered values.
function jitterTick(t: Tick): Tick {
  if (t.symbol === "USDT" || t.symbol === "INR" || t.usdt <= 0) return t;
  const m = 1 + (Math.random() - 0.5) * 0.0006; // ±0.03%
  const usdt = t.usdt * m;
  return { ...t, usdt, inr: usdt * inrRate };
}
export function getCache(): Tick[] { return Array.from(cache.values()).map(jitterTick); }
// Raw (non-jittered) tick lookup — for internal services that need the real
// authoritative external price (e.g. market-maker bot pricing). UI and WS
// boundaries should keep using `getCache()` so the price-flash animation works.
export function getRawTick(symbol: string): Tick | undefined { return cache.get(symbol); }
export function getInrRate(): number { return inrRate; }
export function subscribe(fn: (ticks: Tick[]) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
function broadcast(ticks: Tick[]) {
  const jittered = ticks.map(jitterTick);
  for (const s of subscribers) { try { s(jittered); } catch {} }
}

async function loadInrRate() {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "inr_usdt_rate")).limit(1);
    if (row) { const n = Number(row.value); if (Number.isFinite(n) && n > 0) { inrRate = n; return; } }
  } catch {}
  // DB not set — fall through to live fetch below
  await refreshLiveInrRate();
}

/** Fetches live USD→INR rate from free public forex APIs (no key required). */
async function refreshLiveInrRate(): Promise<void> {
  const attempt = async (url: string, extract: (d: any) => number | undefined): Promise<number | null> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const d = await r.json();
      const v = extract(d);
      return typeof v === "number" && Number.isFinite(v) && v > 50 && v < 200 ? v : null;
    } catch { return null; }
  };

  const live =
    await attempt("https://open.er-api.com/v6/latest/USD", d => d?.rates?.INR) ??
    await attempt("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", d => d?.usd?.inr);

  if (live) {
    const rounded = Math.round(live * 100) / 100;
    inrRate = rounded;
    logger.info({ inrRate: rounded }, "INR rate refreshed from live forex API");
    // Persist back so next startup uses the fresh value
    try {
      await db.insert(settingsTable)
        .values({ key: "inr_usdt_rate", value: String(rounded) })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(rounded) } });
    } catch {}
  }
}

// Map: source symbol (e.g. "BTCUSDT" or coin.symbol fallback) -> { price, change, volume }
async function fetchTickers(coinSymbols: string[]): Promise<Map<string, { price: number; change: number; volume: number }>> {
  const out = new Map<string, { price: number; change: number; volume: number }>();
  if (coinSymbols.length === 0) return out;

  // Primary: Binance 24hr ticker — real-time, no API key required, used as index price
  try {
    const binSyms = coinSymbols.map(s => `${s.toUpperCase()}USDT`);
    // Binance allows max 100 symbols per request — batch into chunks of 100
    const chunks: string[][] = [];
    for (let i = 0; i < binSyms.length; i += 100) chunks.push(binSyms.slice(i, i + 100));
    const results = await Promise.all(chunks.map(async chunk => {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(chunk))}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      return r.json() as Promise<any[]>;
    }));
    for (const data of results) {
      for (const t of data) {
        const sym = String(t.symbol ?? "").replace(/USDT$/, "");
        if (!sym) continue;
        out.set(sym, { price: Number(t.lastPrice), change: Number(t.priceChangePercent), volume: Number(t.quoteVolume) });
      }
    }
    if (out.size > 0) return out;
  } catch (e: any) { logger.warn({ err: e?.message }, "binance primary fetch failed"); }

  // Fallback: CoinGecko (free, no key — slightly slower, ~60s cache)
  try {
    const lc = coinSymbols.map(s => s.toLowerCase()).join(",");
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(lc)}&per_page=250`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const data = await r.json() as any[];
      for (const t of data) {
        const sym = String(t.symbol || "").toUpperCase();
        if (!sym) continue;
        out.set(sym, {
          price: Number(t.current_price ?? 0),
          change: Number(t.price_change_percentage_24h ?? 0),
          volume: Number(t.total_volume ?? 0),
        });
      }
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "coingecko fallback failed"); }

  return out;
}

async function tick() {
  await loadInrRate();
  const coins = await db.select().from(coinsTable);
  const liveCoins = coins.filter(c => c.priceSource !== "manual" && c.symbol !== "INR" && c.symbol !== "USDT");
  const liveSymbols = liveCoins.map(c => (c.binanceSymbol ? c.binanceSymbol.replace(/USDT$/, "") : c.symbol));
  const liveData = await fetchTickers(liveSymbols);
  const updates: Tick[] = [];

  for (const c of coins) {
    let usdt = 0, change = 0, volume = 0;
    const lookupKey = c.binanceSymbol ? c.binanceSymbol.replace(/USDT$/, "") : c.symbol;
    if (c.symbol === "USDT") { usdt = 1; }
    else if (c.symbol === "INR") { usdt = inrRate > 0 ? 1 / inrRate : 0; }
    else if (c.priceSource === "manual") { usdt = Number(c.manualPrice ?? 0); }
    else if (liveData.has(lookupKey)) {
      const d = liveData.get(lookupKey)!;
      usdt = d.price; change = d.change; volume = d.volume;
    } else { usdt = Number(c.currentPrice ?? 0); change = Number(c.change24h ?? 0); }

    // Authoritative tick — used by cache, DB, Redis, pair updater, order matching, futures risk.
    // Display jitter is applied separately at the WS broadcast/snapshot boundary (see jitterTick).
    const inr = usdt * inrRate;
    const t: Tick = { symbol: c.symbol, usdt, inr, change24h: change, volume24h: volume, ts: Date.now() };
    cache.set(c.symbol, t);
    updates.push(t);

    void rSet(`price:${c.symbol}`, JSON.stringify(t), 60);
    void rHset(`price:hash:${c.symbol}`, {
      usdt: String(usdt), inr: String(inr), change24h: String(change), volume24h: String(volume), ts: String(t.ts),
    });

    try {
      await db.update(coinsTable).set({
        currentPrice: String(usdt.toFixed(8)),
        change24h: String(change.toFixed(4)),
        updatedAt: new Date(),
      }).where(eq(coinsTable.id, c.id));
    } catch {}
  }

  void rSet("price:all", JSON.stringify({ inrRate, ticks: updates, ts: Date.now() }), 30);
  // Tag publishes with our INSTANCE_ID so the ws-fanout listener can skip
  // our own messages (we already broadcast() locally below).
  void rPublish("prices.tick", { from: INSTANCE_ID, inrRate, ticks: updates });

  // Update pairs with latest base price (in quote terms — for USDT-quoted pairs use base usdt)
  try {
    const pairs = await db.select().from(pairsTable);
    for (const p of pairs) {
      const base = coins.find(x => x.id === p.baseCoinId);
      const quote = coins.find(x => x.id === p.quoteCoinId);
      if (!base || !quote) continue;
      // Skip auto-update if base coin uses manual price — admin's manual pair edit should persist
      if (base.priceSource === "manual") continue;
      // Skip if pair has real trade fills — pair.last_price is owned by the
      // matching engine (per-fill writes) and pair-stats (30s recompute).
      // Letting the external feed clobber it every second would show feed
      // price instead of true last trade.
      if (Number((p as any).trades24h ?? 0) > 0) continue;
      const bPx = cache.get(base.symbol)?.usdt ?? 0;
      const qPx = cache.get(quote.symbol)?.usdt ?? 1;
      if (bPx > 0 && qPx > 0) {
        const last = bPx / qPx;
        const tickCh = cache.get(base.symbol)?.change24h ?? 0;
        const tickVol = cache.get(base.symbol)?.volume24h ?? 0;
        // NOTE: do NOT write volume_24h/change_24h here — those are owned by
        // the pair-stats service which aggregates real fills from tradesTable.
        // This loop only refreshes lastPrice for pairs whose base coin uses
        // an external feed (so the orderbook midpoint stays in sync).
        await db.update(pairsTable).set({
          lastPrice: String(last.toFixed(8)),
        }).where(eq(pairsTable.id, p.id));
        // Redis pair cache: overlay real pair-stats when fills exist so
        // any consumer (chart fallback, ticker fallback, etc.) sees the
        // authoritative numbers, not the empty external-feed coin volume.
        const display = `${base.symbol}/${quote.symbol}`;
        const ps = getPairStats(display);
        const hasFills = !!ps && ps.trades24h > 0;
        const cachePayload = {
          symbol: p.symbol,
          last: hasFills ? ps!.lastPrice : last,
          change24h: hasFills ? ps!.change24h : tickCh,
          volume24h: hasFills ? ps!.baseVolume : tickVol,
          quoteVolume24h: hasFills ? ps!.quoteVolume : tickVol * last,
          high24h: hasFills ? ps!.high24h : 0,
          low24h: hasFills ? ps!.low24h : 0,
          ts: Date.now(),
        };
        void rSet(`pair:${p.symbol}`, JSON.stringify(cachePayload), 60);
      }
    }
  } catch {}

  broadcast(updates);
}

let started = false;
let ticking = false;
async function safeTick() {
  // Multi-server safety: only the elected leader hits external price APIs.
  // Followers receive ticks via Redis pub/sub (see ws-fanout.ts).
  if (!isLeader()) return;
  if (ticking) return;
  ticking = true;
  try { await tick(); } catch (e: any) { logger.warn({ err: e?.message }, "tick failed"); }
  finally { ticking = false; }
}
export function startPriceService(intervalMs = 1000) {
  if (started) return;
  started = true;
  // Load INR rate from DB (or live forex API) immediately — don't wait for
  // the first tick so analytics requests that arrive early get the correct rate.
  void loadInrRate();
  void safeTick();
  setInterval(() => { void safeTick(); }, intervalMs);
  // Re-read INR rate from DB every 5 minutes so any admin override in
  // Settings → inr_usdt_rate is picked up without a server restart.
  // loadInrRate() calls refreshLiveInrRate() only when DB has no value,
  // so a manually saved admin rate is NEVER auto-overwritten.
  setInterval(() => { if (isLeader()) void loadInrRate(); }, 5 * 60 * 1000);
  logger.info({ intervalMs }, "price service started (leader-gated)");
}

// Inject ticks received from another instance via Redis pub/sub. Updates
// the local cache, INR rate, and triggers in-process subscribers (which
// fan out to WebSocket clients connected to THIS replica). Called from
// ws-fanout.ts on followers.
export function injectExternalTick(ticks: Tick[], remoteInrRate?: number): void {
  if (typeof remoteInrRate === "number" && remoteInrRate > 0) {
    inrRate = remoteInrRate;
  }
  for (const t of ticks) {
    if (t && typeof t.symbol === "string") {
      cache.set(t.symbol, t);
    }
  }
  broadcast(ticks);
}
