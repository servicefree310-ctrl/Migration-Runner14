import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  db, bannersTable, promotionsTable, pairsTable, coinsTable, ordersTable,
  tradesTable, earnProductsTable, fundingRatesTable, settingsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { rSet, rZadd, rLpush, isRedisReady, getRedis } from "./redis";
import { getCacheConfig } from "../routes/redis-admin";

async function warmBanners() {
  const c = await getCacheConfig("cms.banners");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const now = new Date();
  const mob = await db.select().from(bannersTable).where(and(
    eq(bannersTable.isActive, true), eq(bannersTable.showOnMobile, true),
    or(isNull(bannersTable.startsAt), lte(bannersTable.startsAt, now))!,
    or(isNull(bannersTable.endsAt), gte(bannersTable.endsAt, now))!,
  )).orderBy(asc(bannersTable.position));
  const web = await db.select().from(bannersTable).where(and(
    eq(bannersTable.isActive, true), eq(bannersTable.showOnWeb, true),
    or(isNull(bannersTable.startsAt), lte(bannersTable.startsAt, now))!,
    or(isNull(bannersTable.endsAt), gte(bannersTable.endsAt, now))!,
  )).orderBy(asc(bannersTable.position));
  await rSet("cache:banners:mobile", JSON.stringify(mob), c.ttlSec);
  await rSet("cache:banners:web", JSON.stringify(web), c.ttlSec);
  return mob.length + web.length;
}

async function warmPromotions() {
  const c = await getCacheConfig("cms.promotions");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const now = new Date();
  const rows = await db.select().from(promotionsTable).where(and(
    eq(promotionsTable.isActive, true), eq(promotionsTable.showOnMobile, true),
    or(isNull(promotionsTable.startsAt), lte(promotionsTable.startsAt, now))!,
    or(isNull(promotionsTable.endsAt), gte(promotionsTable.endsAt, now))!,
  )).orderBy(asc(promotionsTable.position));
  await rSet("cache:promotions:mobile", JSON.stringify(rows), c.ttlSec);
  return rows.length;
}

async function warmMarkets() {
  const c = await getCacheConfig("markets.list");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const pairs = await db.select().from(pairsTable);
  const coins = await db.select().from(coinsTable);
  await rSet("cache:markets:pairs", JSON.stringify(pairs), c.ttlSec);
  await rSet("cache:markets:coins", JSON.stringify(coins), c.ttlSec);
  return pairs.length + coins.length;
}

async function warmEarnProducts() {
  const c = await getCacheConfig("earn.products");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  try {
    const rows = await db.select().from(earnProductsTable);
    await rSet("cache:earn:products", JSON.stringify(rows), c.ttlSec);
    return rows.length;
  } catch { return 0; }
}

async function warmFundingRates() {
  const c = await getCacheConfig("futures.funding");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const rows = await db.select().from(fundingRatesTable).orderBy(desc(fundingRatesTable.fundingTime)).limit(500);
  const byPair: Record<number, any[]> = {};
  for (const r of rows) (byPair[r.pairId] ||= []).push(r);
  for (const [pid, list] of Object.entries(byPair)) {
    await rSet(`cache:funding:${pid}`, JSON.stringify(list.slice(0, 50)), c.ttlSec);
  }
  return rows.length;
}

async function warmOrderbook() {
  const c = await getCacheConfig("orderbook");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const r = getRedis();
  if (!r) return 0;
  // Clean up stale orderbook zsets first (keys exist but server restarted — DB is truth)
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", "orderbook:*:buy", "COUNT", 100);
    cursor = next;
    if (batch.length) await r.del(...batch);
  } while (cursor !== "0");
  cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", "orderbook:*:sell", "COUNT", 100);
    cursor = next;
    if (batch.length) await r.del(...batch);
  } while (cursor !== "0");

  const open = await db.select().from(ordersTable)
    .where(or(eq(ordersTable.status, "open"), eq(ordersTable.status, "partial"))!)
    .orderBy(desc(ordersTable.createdAt)).limit(5000);
  const pairs = await db.select().from(pairsTable);
  const pairMap = new Map(pairs.map(p => [p.id, p]));
  let n = 0;
  for (const o of open) {
    const pair = pairMap.get(o.pairId);
    if (!pair || o.type !== "limit") continue;
    const symbol = pair.symbol;
    const score = (o.side === "buy" ? -1 : 1) * Number(o.price);
    const member = JSON.stringify({
      id: o.id, userId: o.userId, side: o.side, type: o.type,
      price: Number(o.price), qty: Number(o.qty), filledQty: Number(o.filledQty ?? 0),
      status: o.status, ts: o.createdAt?.getTime() ?? Date.now(),
    });
    await rZadd(`orderbook:${symbol}:${o.side}`, score, String(o.id));
    await rSet(`orderbook:${symbol}:order:${o.id}`, member, c.ttlSec);
    n++;
  }
  return n;
}

async function warmRecentTrades() {
  const c = await getCacheConfig("trades.recent");
  if (!c?.enabled || !c.cacheOnServer) return 0;
  const r = getRedis();
  if (!r) return 0;
  // Wipe stale trade lists first
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", "trades:*", "COUNT", 100);
    cursor = next;
    if (batch.length) await r.del(...batch);
  } while (cursor !== "0");

  const trades = await db.select().from(tradesTable).orderBy(desc(tradesTable.createdAt)).limit(2000);
  const pairs = await db.select().from(pairsTable);
  const pairMap = new Map(pairs.map(p => [p.id, p]));
  let n = 0;
  // Reverse so newest ends up at head of list (lpush stacks newest on left)
  for (const t of [...trades].reverse()) {
    const pair = pairMap.get(t.pairId);
    if (!pair) continue;
    const payload = JSON.stringify({
      id: t.id, pairId: t.pairId, side: t.side,
      price: Number(t.price), qty: Number(t.qty), fee: Number(t.fee),
      userId: t.userId, ts: t.createdAt?.getTime() ?? Date.now(),
    });
    await rLpush(`trades:${pair.symbol}`, payload);
    await rLpush(`trades:user:${t.userId}`, payload);
    n++;
  }
  return n;
}

async function warmSettings() {
  try {
    const rows = await db.select().from(settingsTable);
    const obj: Record<string, string> = {};
    for (const r of rows) obj[r.key] = r.value;
    await rSet("cache:settings", JSON.stringify(obj), 300);
    return rows.length;
  } catch { return 0; }
}

let lastWarmAt = 0;
let warming = false;

export async function warmAllCaches(): Promise<Record<string, number>> {
  if (!isRedisReady()) return {};
  if (warming) return { skipped: 1 };
  warming = true;
  const t0 = Date.now();
  const stats: Record<string, number> = {};
  try {
    const [b, p, m, e, f, ob, tr, s] = await Promise.all([
      warmBanners().catch(() => 0),
      warmPromotions().catch(() => 0),
      warmMarkets().catch(() => 0),
      warmEarnProducts().catch(() => 0),
      warmFundingRates().catch(() => 0),
      warmOrderbook().catch(() => 0),
      warmRecentTrades().catch(() => 0),
      warmSettings().catch(() => 0),
    ]);
    stats.banners = b; stats.promotions = p; stats.markets = m; stats.earn = e;
    stats.funding = f; stats.orderbook = ob; stats.trades = tr; stats.settings = s;
    stats.elapsedMs = Date.now() - t0;
    lastWarmAt = Date.now();
    logger.info(stats, "cache warmup complete");
  } finally { warming = false; }
  return stats;
}

export function getLastWarmAt() { return lastWarmAt; }

export async function invalidate(pattern: string) {
  const r = getRedis();
  if (!r || !isRedisReady()) return 0;
  let cursor = "0", deleted = 0;
  do {
    const [next, batch] = await r.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (batch.length) deleted += await r.del(...batch);
  } while (cursor !== "0");
  return deleted;
}

export function startWarmupRefresh(intervalMs = 60000) {
  // Multi-server safety: only the leader warms shared Redis caches.
  // Followers read from the same Redis, so they get the warmed values for
  // free without duplicating expensive DB scans.
  setInterval(async () => {
    const { isLeader } = await import("./leader");
    if (!isLeader()) return;
    void warmAllCaches();
  }, intervalMs);
}
