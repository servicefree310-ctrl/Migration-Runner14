import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cacheConfigsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getRedis, isRedisReady } from "../lib/redis";

const router: IRouter = Router();

const DEFAULT_CONFIGS = [
  { cacheKey: "prices.ticker", label: "Live Price Ticker", description: "Per-coin USDT/INR price + 24h change", category: "prices", ttlSec: 60, pattern: "price:*" },
  { cacheKey: "prices.pair", label: "Trading Pair Last Price", description: "Per-pair last traded price", category: "prices", ttlSec: 60, pattern: "pair:*" },
  { cacheKey: "prices.snapshot", label: "Full Price Snapshot", description: "Complete ticker snapshot (every tick)", category: "prices", ttlSec: 30, pattern: "price:all" },
  { cacheKey: "orderbook", label: "Order Book", description: "Live limit orders sorted by price", category: "trading", ttlSec: 86400, pattern: "orderbook:*" },
  { cacheKey: "trades.recent", label: "Recent Trades Tape", description: "Last 1000 trades per pair", category: "trading", ttlSec: 3600, pattern: "trades:*" },
  { cacheKey: "orders.user", label: "User Order Feed", description: "Recent orders per user (private)", category: "trading", ttlSec: 86400, pattern: "orders:user:*" },
  { cacheKey: "markets.list", label: "Markets List", description: "All trading pairs with prices", category: "markets", ttlSec: 10, pattern: "cache:markets:*" },
  { cacheKey: "klines", label: "Candle Charts (Klines)", description: "OHLCV candle data per pair/interval", category: "markets", ttlSec: 30, pattern: "cache:klines:*" },
  { cacheKey: "cms.banners", label: "Home Banners", description: "Admin-managed home screen banners", category: "cms", ttlSec: 120, pattern: "cache:banners:*" },
  { cacheKey: "cms.promotions", label: "Promotions & Contests", description: "Admin-managed promotions", category: "cms", ttlSec: 120, pattern: "cache:promotions:*" },
  { cacheKey: "user.wallet", label: "User Wallets", description: "Per-user wallet balances cache", category: "user", ttlSec: 15, pattern: "cache:wallet:*" },
  { cacheKey: "user.profile", label: "User Profile", description: "Profile + KYC tier cache", category: "user", ttlSec: 60, pattern: "cache:profile:*" },
  { cacheKey: "user.fees", label: "User Fee Tier", description: "VIP tier + 30d volume", category: "user", ttlSec: 300, pattern: "cache:fees:*" },
  { cacheKey: "earn.products", label: "Earn Products", description: "Stake/earn product list", category: "earn", ttlSec: 300, pattern: "cache:earn:*" },
  { cacheKey: "futures.funding", label: "Futures Funding Rate", description: "Per-pair funding rate", category: "futures", ttlSec: 60, pattern: "cache:funding:*" },
];

let configCache: Record<string, any> = {};
let configLoadedAt = 0;
async function loadConfigs(force = false) {
  if (!force && Date.now() - configLoadedAt < 5000) return configCache;
  const rows = await db.select().from(cacheConfigsTable);
  const map: Record<string, any> = {};
  for (const r of rows) map[r.cacheKey] = r;
  configCache = map;
  configLoadedAt = Date.now();
  return map;
}

export async function getCacheConfig(key: string) {
  const map = await loadConfigs();
  return map[key] ?? null;
}

export async function shouldCacheServer(key: string): Promise<boolean> {
  const c = await getCacheConfig(key);
  return !!(c && c.enabled && c.cacheOnServer && isRedisReady());
}

export async function getCacheTtl(key: string, fallback = 60): Promise<number> {
  const c = await getCacheConfig(key);
  return c?.ttlSec ?? fallback;
}

export async function seedCacheConfigs() {
  const existing = await db.select().from(cacheConfigsTable);
  const have = new Set(existing.map(r => r.cacheKey));
  for (const d of DEFAULT_CONFIGS) {
    if (!have.has(d.cacheKey)) {
      try { await db.insert(cacheConfigsTable).values(d as any); } catch {}
    }
  }
  await loadConfigs(true);
}

router.get("/redis/status", requireAuth, requireRole("admin", "superadmin"), async (_req, res) => {
  const r = getRedis();
  if (!r || !isRedisReady()) { res.json({ ready: false }); return; }
  try {
    const info = await r.info();
    const dbsize = await r.dbsize();
    const parse = (k: string) => {
      const m = info.match(new RegExp(`^${k}:(.*)$`, "m"));
      return m?.[1]?.trim();
    };
    res.json({
      ready: true,
      version: parse("redis_version"),
      uptimeSec: Number(parse("uptime_in_seconds") ?? 0),
      memoryUsed: parse("used_memory_human"),
      memoryPeak: parse("used_memory_peak_human"),
      maxMemory: parse("maxmemory_human"),
      maxMemoryPolicy: parse("maxmemory_policy"),
      connectedClients: Number(parse("connected_clients") ?? 0),
      totalCommands: Number(parse("total_commands_processed") ?? 0),
      opsPerSec: Number(parse("instantaneous_ops_per_sec") ?? 0),
      hits: Number(parse("keyspace_hits") ?? 0),
      misses: Number(parse("keyspace_misses") ?? 0),
      hitRate: (() => {
        const h = Number(parse("keyspace_hits") ?? 0);
        const m = Number(parse("keyspace_misses") ?? 0);
        return h + m === 0 ? 0 : (h / (h + m)) * 100;
      })(),
      keysCount: dbsize,
    });
  } catch (e: any) {
    res.status(500).json({ ready: false, error: e.message });
  }
});

router.get("/redis/keys", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const r = getRedis();
  if (!r || !isRedisReady()) { res.json({ keys: [] }); return; }
  const pattern = (req.query.pattern as string) || "*";
  const limit = Math.min(500, Number(req.query.limit ?? 200));
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await r.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next; keys.push(...batch);
      if (keys.length >= limit) break;
    } while (cursor !== "0");
    const out = await Promise.all(keys.slice(0, limit).map(async k => {
      const ttl = await r.ttl(k);
      const type = await r.type(k);
      let preview: any = null;
      try {
        if (type === "string") { const v = await r.get(k); preview = v && v.length > 200 ? v.slice(0,200) + "..." : v; }
        else if (type === "hash") preview = await r.hgetall(k);
        else if (type === "list") preview = await r.lrange(k, 0, 4);
        else if (type === "zset") preview = await r.zrange(k, 0, 4, "WITHSCORES");
      } catch {}
      return { key: k, type, ttl, preview };
    }));
    res.json({ keys: out, total: keys.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/redis/key", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const r = getRedis();
  if (!r || !isRedisReady()) { res.status(503).json({ error: "Redis not ready" }); return; }
  const key = req.query.key as string;
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const n = await r.del(key);
  res.json({ deleted: n });
});

router.post("/redis/flush-pattern", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const r = getRedis();
  if (!r || !isRedisReady()) { res.status(503).json({ error: "Redis not ready" }); return; }
  const pattern = req.body?.pattern as string;
  if (!pattern) { res.status(400).json({ error: "pattern required" }); return; }
  let cursor = "0", deleted = 0;
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", pattern, "COUNT", 500);
    cursor = next;
    if (batch.length > 0) deleted += await r.del(...batch);
  } while (cursor !== "0");
  res.json({ deleted });
});

router.post("/redis/flush-all", requireAuth, requireRole("superadmin"), async (_req, res) => {
  const r = getRedis();
  if (!r || !isRedisReady()) { res.status(503).json({ error: "Redis not ready" }); return; }
  await r.flushdb();
  res.json({ ok: true });
});

router.get("/redis/configs", requireAuth, requireRole("admin", "superadmin"), async (_req, res) => {
  const rows = await db.select().from(cacheConfigsTable);
  rows.sort((a, b) => (a.category + a.label).localeCompare(b.category + b.label));
  res.json(rows);
});

router.patch("/redis/configs/:key", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const allowed: any = {};
  for (const f of ["label","description","category","ttlSec","enabled","cacheOnServer","cacheOnMobile","cacheOnWeb","pattern"]) {
    if (f in (req.body ?? {})) allowed[f] = req.body[f];
  }
  if (Object.keys(allowed).length === 0) { res.status(400).json({ error: "no fields" }); return; }
  const [updated] = await db.update(cacheConfigsTable).set(allowed as any).where(eq(cacheConfigsTable.cacheKey, key)).returning();
  if (!updated) { res.status(404).json({ error: "config not found" }); return; }
  await loadConfigs(true);
  res.json(updated);
});

router.post("/redis/configs/reseed", requireAuth, requireRole("superadmin"), async (_req, res) => {
  await seedCacheConfigs();
  const rows = await db.select().from(cacheConfigsTable);
  res.json({ ok: true, count: rows.length });
});

router.post("/redis/warm", requireAuth, requireRole("admin", "superadmin"), async (_req, res) => {
  const { warmAllCaches } = await import("../lib/cache-warmup");
  const stats = await warmAllCaches();
  res.json({ ok: true, stats });
});

// ====== Matching engine admin ======
router.get("/matching/status", requireAuth, requireRole("admin", "superadmin", "support"), async (_req, res) => {
  const { getEngineStats } = await import("../lib/matching-engine");
  res.json(getEngineStats());
});
router.post("/matching/toggle", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const { setEngineEnabled, getEngineStats } = await import("../lib/matching-engine");
  setEngineEnabled(!!req.body?.enabled);
  res.json(getEngineStats());
});
router.post("/matching/reset-stats", requireAuth, requireRole("admin", "superadmin"), async (_req, res) => {
  const { resetEngineStats, getEngineStats } = await import("../lib/matching-engine");
  resetEngineStats();
  res.json(getEngineStats());
});
router.post("/matching/run/:orderId", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const { tryMatch } = await import("../lib/matching-engine");
  const id = Number(req.params.orderId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad orderId" }); return; }
  const r = await tryMatch(id);
  res.json(r);
});
router.post("/matching/sweep", requireAuth, requireRole("admin", "superadmin"), async (req, res) => {
  const { tryMatch } = await import("../lib/matching-engine");
  const { db: ddb, ordersTable: ot, pairsTable: pt } = await import("@workspace/db");
  const { eq: eq2, and: and2, or: or2, desc: desc2 } = await import("drizzle-orm");
  const symbol = req.body?.symbol ? String(req.body.symbol).toUpperCase() : null;
  let pairIds: number[] | null = null;
  if (symbol) {
    const pair = await ddb.select().from(pt).where(eq2(pt.symbol, symbol)).limit(1);
    if (!pair[0]) { res.status(404).json({ error: "pair not found" }); return; }
    pairIds = [pair[0].id];
  }
  const open = await ddb.select().from(ot)
    .where(and2(or2(eq2(ot.status, "open"), eq2(ot.status, "partial"))!, ...(pairIds ? [eq2(ot.pairId, pairIds[0])] : []) as any))
    .orderBy(desc2(ot.createdAt)).limit(500);
  let totalTrades = 0;
  for (const o of open) {
    const r = await tryMatch(o.id);
    totalTrades += r.trades;
  }
  res.json({ scanned: open.length, totalTrades });
});
router.get("/matching/depth/:symbol", requireAuth, requireRole("admin", "superadmin", "support"), async (req, res) => {
  const { getDepth } = await import("../lib/matching-engine");
  const depth = await getDepth(String(req.params.symbol).toUpperCase(), Number(req.query.levels) || 30);
  res.json(depth);
});

// Public: tells mobile/web what to cache locally
router.get("/cache/config", async (req, res) => {
  const platform = String((req as any).query?.platform || "mobile");
  const map = await loadConfigs();
  const out: Record<string, { ttlSec: number; enabled: boolean }> = {};
  for (const [k, v] of Object.entries(map)) {
    const allowed = platform === "web" ? (v as any).cacheOnWeb : (v as any).cacheOnMobile;
    out[k] = { ttlSec: (v as any).ttlSec, enabled: !!((v as any).enabled && allowed) };
  }
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json({ platform, configs: out });
});

export default router;
