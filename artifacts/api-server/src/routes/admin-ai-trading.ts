import { Router, type IRouter } from "express";
import { db, aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable, usersTable, settingsTable } from "@workspace/db";
import { eq, desc, count, sum } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const requireAdmin = requireRole("admin", "superadmin");

function serializePlan(p: any, investors = 0) {
  return {
    id: p.id, name: p.name, description: p.description ?? null,
    dailyReturnPercent: parseFloat(p.dailyReturnPercent),
    minInvestment: parseFloat(p.minInvestment), maxInvestment: parseFloat(p.maxInvestment),
    durationDays: p.durationDays, riskLevel: p.riskLevel,
    isActive: p.isActive, totalInvestors: investors,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

router.get("/admin/ai-trading/plans", requireAdmin, async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable).orderBy(desc(aiTradingPlansTable.createdAt));
  const out = await Promise.all(plans.map(async p => {
    const [r] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable)
      .where(eq(aiTradingSubscriptionsTable.planId, p.id));
    return serializePlan(p, r.count);
  }));
  res.json(out);
});

router.post("/admin/ai-trading/plans", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, dailyReturnPercent, minInvestment, maxInvestment, durationDays, riskLevel = "medium", isActive = true } = req.body;
  if (!name || !dailyReturnPercent || !minInvestment || !maxInvestment || !durationDays) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [plan] = await db.insert(aiTradingPlansTable).values({
    name, description: description ?? null,
    dailyReturnPercent: String(dailyReturnPercent),
    minInvestment: String(minInvestment),
    maxInvestment: String(maxInvestment),
    durationDays: parseInt(durationDays, 10),
    riskLevel, isActive,
  }).returning();
  res.status(201).json(serializePlan(plan));
});

router.patch("/admin/ai-trading/plans/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  const upd: any = { updatedAt: new Date() };
  for (const k of ["name", "description", "riskLevel", "isActive", "durationDays"]) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  for (const k of ["dailyReturnPercent", "minInvestment", "maxInvestment"]) {
    if (req.body[k] !== undefined) upd[k] = String(req.body[k]);
  }
  const [plan] = await db.update(aiTradingPlansTable).set(upd)
    .where(eq(aiTradingPlansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(serializePlan(plan));
});

router.delete("/admin/ai-trading/plans/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid plan ID" }); return; }
  await db.update(aiTradingPlansTable).set({ isActive: false })
    .where(eq(aiTradingPlansTable.id, id));
  res.json({ success: true });
});

router.get("/admin/ai-trading/subscriptions", requireAdmin, async (_req, res): Promise<void> => {
  const subs = await db.select({
    id: aiTradingSubscriptionsTable.id,
    userId: aiTradingSubscriptionsTable.userId,
    planId: aiTradingSubscriptionsTable.planId,
    investedAmount: aiTradingSubscriptionsTable.investedAmount,
    startedAt: aiTradingSubscriptionsTable.startedAt,
    expiresAt: aiTradingSubscriptionsTable.expiresAt,
    status: aiTradingSubscriptionsTable.status,
    totalEarned: aiTradingSubscriptionsTable.totalEarned,
    userName: usersTable.name,
    userEmail: usersTable.email,
    planName: aiTradingPlansTable.name,
  }).from(aiTradingSubscriptionsTable)
    .leftJoin(usersTable, eq(aiTradingSubscriptionsTable.userId, usersTable.id))
    .leftJoin(aiTradingPlansTable, eq(aiTradingSubscriptionsTable.planId, aiTradingPlansTable.id))
    .orderBy(desc(aiTradingSubscriptionsTable.createdAt))
    .limit(500);
  res.json(subs.map(s => ({
    ...s,
    investedAmount: parseFloat(s.investedAmount),
    totalEarned: parseFloat(s.totalEarned ?? "0"),
    startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
    expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : s.expiresAt,
  })));
});

router.get("/admin/ai-trading/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [activeSubs] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.status, "active"));
  const [totalSubs] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable);
  const [earnings] = await db.select({ total: sum(aiTradingEarningsTable.amountUsdt) })
    .from(aiTradingEarningsTable);
  res.json({
    activeSubscriptions: activeSubs.count,
    totalSubscriptions: totalSubs.count,
    totalEarningsPaid: parseFloat(earnings.total ?? "0"),
  });
});

/* ── Hero Stats Settings (admin CRUD) ──────────────────────────────────── */

const HERO_KEYS = ["ai_hero_base_volume", "ai_hero_base_bots", "ai_hero_win_rate", "ai_hero_avg_apy"] as const;

async function getHeroSettings() {
  const rows = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "ai_hero_base_volume"))
    .limit(0); // trick to get type; we do a bulk fetch below
  const all = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of all) map[r.key] = r.value ?? "";
  return {
    baseVolume: map["ai_hero_base_volume"] ?? "284000000",
    baseBots:   map["ai_hero_base_bots"]   ?? "12000",
    winRate:    map["ai_hero_win_rate"]     ?? "74.6",
    avgApy:     map["ai_hero_avg_apy"]      ?? "156",
  };
}

router.get("/admin/ai-trading/hero-stats", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getHeroSettings());
});

router.put("/admin/ai-trading/hero-stats", requireAdmin, async (req, res): Promise<void> => {
  const { baseVolume, baseBots, winRate, avgApy } = req.body ?? {};
  const upserts: { key: string; value: string }[] = [];
  if (baseVolume !== undefined) upserts.push({ key: "ai_hero_base_volume", value: String(baseVolume) });
  if (baseBots   !== undefined) upserts.push({ key: "ai_hero_base_bots",   value: String(baseBots) });
  if (winRate    !== undefined) upserts.push({ key: "ai_hero_win_rate",    value: String(winRate) });
  if (avgApy     !== undefined) upserts.push({ key: "ai_hero_avg_apy",     value: String(avgApy) });

  for (const u of upserts) {
    await db.insert(settingsTable).values({ key: u.key, value: u.value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: u.value } });
  }
  res.json(await getHeroSettings());
});

export default router;
