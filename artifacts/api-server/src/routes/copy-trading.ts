/**
 * Copy Trading API
 *
 *   GET   /copy/leaderboard            — top traders by 30d PnL
 *   GET   /copy/traders/:id            — trader profile detail
 *   POST  /copy/become-trader          — register caller as a trader
 *   PATCH /copy/me                     — update own trader profile
 *   GET   /copy/me/followers           — who copies caller
 *
 *   GET   /copy/me/following           — who caller is copying
 *   POST  /copy/follow                 — start copying a trader (allocation)
 *   PATCH /copy/relations/:id          — update allocation/ratio
 *   POST  /copy/relations/:id/stop     — stop following
 */
import { Router, type IRouter } from "express";
import { db, traderProfilesTable, copyRelationsTable, usersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Public leaderboard ─────────────────────────────────────────────────────
router.get("/copy/leaderboard", async (req, res): Promise<void> => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const sort = typeof req.query.sort === "string" ? req.query.sort : "pnl30d";
  const orderCol = sort === "pnl90d" ? traderProfilesTable.pnl90dPct
    : sort === "winrate" ? traderProfilesTable.winRatePct
    : sort === "aum" ? traderProfilesTable.aumUsd
    : sort === "followers" ? traderProfilesTable.followersCount
    : traderProfilesTable.pnl30dPct;
  const rows = await db.select().from(traderProfilesTable)
    .where(eq(traderProfilesTable.isActive, true))
    .orderBy(desc(orderCol))
    .limit(limit);
  res.json({ items: rows });
});

router.get("/copy/traders/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [row] = await db.select().from(traderProfilesTable).where(eq(traderProfilesTable.id, id));
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ trader: row });
});

// ─── Trader (publish self) ──────────────────────────────────────────────────
router.post("/copy/become-trader", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to become a trader" }); return;
  }
  const { displayName, bio, performanceFeeBps, tags } = req.body ?? {};
  if (typeof displayName !== "string" || displayName.trim().length < 3) {
    res.status(400).json({ error: "displayName >= 3 chars" }); return;
  }
  const fee = Number(performanceFeeBps ?? 1000);
  if (!Number.isFinite(fee) || fee < 0 || fee > 5000) { res.status(400).json({ error: "performanceFeeBps 0-5000" }); return; }

  const [existing] = await db.select().from(traderProfilesTable).where(eq(traderProfilesTable.userId, userId));
  if (existing) { res.status(409).json({ error: "already a trader" }); return; }

  const [row] = await db.insert(traderProfilesTable).values({
    userId,
    displayName: displayName.slice(0, 50),
    bio: typeof bio === "string" ? bio.slice(0, 500) : "",
    performanceFeeBps: fee,
    tags: Array.isArray(tags) ? tags.slice(0, 10).map((t) => String(t).slice(0, 30)) : [],
  }).returning();
  res.json({ trader: row });
});

router.patch("/copy/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.displayName === "string") updates.displayName = req.body.displayName.slice(0, 50);
  if (typeof req.body?.bio === "string") updates.bio = req.body.bio.slice(0, 500);
  if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;
  if (Array.isArray(req.body?.tags)) updates.tags = req.body.tags.slice(0, 10).map((t: unknown) => String(t).slice(0, 30));
  if (req.body?.performanceFeeBps != null) {
    const fee = Number(req.body.performanceFeeBps);
    if (!Number.isFinite(fee) || fee < 0 || fee > 5000) { res.status(400).json({ error: "fee 0-5000" }); return; }
    updates.performanceFeeBps = fee;
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  updates.updatedAt = new Date();

  const [row] = await db.update(traderProfilesTable).set(updates).where(eq(traderProfilesTable.userId, userId)).returning();
  if (!row) { res.status(404).json({ error: "not a trader yet" }); return; }
  res.json({ trader: row });
});

router.get("/copy/me/followers", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [trader] = await db.select().from(traderProfilesTable).where(eq(traderProfilesTable.userId, userId));
  if (!trader) { res.json({ items: [] }); return; }
  const rows = await db.select().from(copyRelationsTable)
    .where(and(eq(copyRelationsTable.traderId, trader.id), eq(copyRelationsTable.status, "active")))
    .orderBy(desc(copyRelationsTable.startedAt));
  res.json({ items: rows });
});

// ─── Follower ───────────────────────────────────────────────────────────────
router.get("/copy/me/following", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({
    relation: copyRelationsTable,
    trader: traderProfilesTable,
  }).from(copyRelationsTable)
    .leftJoin(traderProfilesTable, eq(traderProfilesTable.id, copyRelationsTable.traderId))
    .where(eq(copyRelationsTable.followerId, req.user!.id))
    .orderBy(desc(copyRelationsTable.startedAt));
  res.json({ items: rows });
});

router.post("/copy/follow", requireAuth, async (req, res): Promise<void> => {
  const followerId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to follow traders" }); return;
  }
  const { traderId, allocationUsd, copyRatio, maxRiskPerTradePct } = req.body ?? {};
  const tid = Number(traderId);
  if (!Number.isFinite(tid)) { res.status(400).json({ error: "traderId required" }); return; }

  const [trader] = await db.select().from(traderProfilesTable).where(eq(traderProfilesTable.id, tid));
  if (!trader || !trader.isActive) { res.status(404).json({ error: "trader not found / inactive" }); return; }
  if (trader.userId === followerId) { res.status(400).json({ error: "cannot copy yourself" }); return; }

  const alloc = Number(allocationUsd);
  if (!Number.isFinite(alloc) || alloc < 100 || alloc > 1_000_000) { res.status(400).json({ error: "allocationUsd 100-1M" }); return; }
  const ratio = Number(copyRatio ?? 1);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 5) { res.status(400).json({ error: "copyRatio 0-5" }); return; }
  const maxRisk = Number(maxRiskPerTradePct ?? 5);
  if (!Number.isFinite(maxRisk) || maxRisk <= 0 || maxRisk > 50) { res.status(400).json({ error: "maxRisk 0-50%" }); return; }

  // Idempotent: if already following, reactivate + update
  const [existing] = await db.select().from(copyRelationsTable)
    .where(and(eq(copyRelationsTable.followerId, followerId), eq(copyRelationsTable.traderId, tid)));
  if (existing) {
    const [row] = await db.update(copyRelationsTable).set({
      status: "active",
      allocationUsd: String(alloc),
      copyRatio: String(ratio),
      maxRiskPerTradePct: String(maxRisk),
      stoppedAt: null,
    }).where(eq(copyRelationsTable.id, existing.id)).returning();
    res.json({ relation: row });
    return;
  }

  const [row] = await db.insert(copyRelationsTable).values({
    followerId,
    traderId: tid,
    allocationUsd: String(alloc),
    copyRatio: String(ratio),
    maxRiskPerTradePct: String(maxRisk),
  }).returning();
  await db.update(traderProfilesTable).set({
    followersCount: sql`${traderProfilesTable.followersCount} + 1`,
    aumUsd: sql`${traderProfilesTable.aumUsd} + ${String(alloc)}`,
  }).where(eq(traderProfilesTable.id, tid));
  res.json({ relation: row });
});

router.patch("/copy/relations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const updates: Record<string, unknown> = {};
  if (req.body?.allocationUsd != null) {
    const a = Number(req.body.allocationUsd);
    if (!Number.isFinite(a) || a < 100) { res.status(400).json({ error: "allocationUsd >= 100" }); return; }
    updates.allocationUsd = String(a);
  }
  if (req.body?.copyRatio != null) {
    const r = Number(req.body.copyRatio);
    if (!Number.isFinite(r) || r <= 0 || r > 5) { res.status(400).json({ error: "copyRatio 0-5" }); return; }
    updates.copyRatio = String(r);
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  const [row] = await db.update(copyRelationsTable).set(updates)
    .where(and(eq(copyRelationsTable.id, id), eq(copyRelationsTable.followerId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ relation: row });
});

router.post("/copy/relations/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [rel] = await db.select().from(copyRelationsTable)
    .where(and(eq(copyRelationsTable.id, id), eq(copyRelationsTable.followerId, req.user!.id)));
  if (!rel) { res.status(404).json({ error: "not found" }); return; }
  if (rel.status !== "active") { res.json({ relation: rel }); return; }
  const [row] = await db.update(copyRelationsTable).set({
    status: "stopped",
    stoppedAt: new Date(),
  }).where(eq(copyRelationsTable.id, id)).returning();
  await db.update(traderProfilesTable).set({
    followersCount: sql`GREATEST(0, ${traderProfilesTable.followersCount} - 1)`,
    aumUsd: sql`GREATEST(0, ${traderProfilesTable.aumUsd} - ${rel.allocationUsd})`,
  }).where(eq(traderProfilesTable.id, rel.traderId));
  res.json({ relation: row });
});

// ─── Own trader profile ──────────────────────────────────────────────────────
router.get("/copy/me/profile", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select().from(traderProfilesTable)
    .where(eq(traderProfilesTable.userId, req.user!.id));
  res.json({ trader: row ?? null });
});

// ─── Admin: manage trader profiles ──────────────────────────────────────────
const adminOnly = requireRole("admin", "superadmin");

router.get("/admin/copy/traders", adminOnly, async (req, res): Promise<void> => {
  const rows = await db.select({
    trader: traderProfilesTable,
    user: { id: usersTable.id, email: usersTable.email, name: usersTable.name },
  }).from(traderProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, traderProfilesTable.userId))
    .orderBy(desc(traderProfilesTable.aumUsd))
    .limit(500);
  res.json({ items: rows });
});

router.patch("/admin/copy/traders/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.isVerified === "boolean") updates.isVerified = req.body.isVerified;
  if (typeof req.body?.isActive === "boolean")   updates.isActive   = req.body.isActive;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  updates.updatedAt = new Date();
  const [row] = await db.update(traderProfilesTable).set(updates)
    .where(eq(traderProfilesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ trader: row });
});

router.get("/admin/copy/stats", adminOnly, async (req, res): Promise<void> => {
  const [stats] = await db.select({
    totalTraders: sql<number>`count(*)::int`,
    activeTraders: sql<number>`count(*) filter (where ${traderProfilesTable.isActive})::int`,
    totalFollowers: sql<number>`coalesce(sum(${traderProfilesTable.followersCount}), 0)::int`,
    totalAum: sql<string>`coalesce(sum(${traderProfilesTable.aumUsd}), 0)::text`,
  }).from(traderProfilesTable);
  const [relStats] = await db.select({
    activeRelations: sql<number>`count(*) filter (where ${copyRelationsTable.status} = 'active')::int`,
  }).from(copyRelationsTable);
  res.json({ ...stats, ...relStats });
});

export default router;
