/**
 * User Notifications + Price Alerts API
 *
 *   GET    /notifications/me                — recent notifications (paginated)
 *   GET    /notifications/me/unread-count   — count for bell badge
 *   POST   /notifications/me/read-all       — mark all as read
 *   POST   /notifications/me/:id/read       — mark one as read
 *   DELETE /notifications/me/:id            — delete one
 *
 *   GET    /alerts/me                       — caller's price alerts
 *   POST   /alerts                          — create new
 *   PATCH  /alerts/:id                      — update (status, target, etc.)
 *   DELETE /alerts/:id                      — delete
 */
import { Router, type IRouter } from "express";
import { db, userNotificationsTable, priceAlertsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getUnreadCount, notify } from "../lib/notifications";

const router: IRouter = Router();

// ─── Notifications ──────────────────────────────────────────────────────────
router.get("/notifications/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const category = typeof req.query.category === "string" ? req.query.category : undefined;

  const conds = [eq(userNotificationsTable.userId, userId)];
  if (category) conds.push(eq(userNotificationsTable.category, category));
  const rows = await db.select().from(userNotificationsTable)
    .where(and(...conds))
    .orderBy(desc(userNotificationsTable.createdAt))
    .limit(limit);
  res.json({ items: rows });
});

router.get("/notifications/me/unread-count", requireAuth, async (req, res): Promise<void> => {
  const n = await getUnreadCount(req.user!.id);
  res.json({ count: n });
});

router.post("/notifications/me/read-all", requireAuth, async (req, res): Promise<void> => {
  await db.update(userNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(userNotificationsTable.userId, req.user!.id), sql`${userNotificationsTable.readAt} IS NULL`));
  res.json({ ok: true });
});

router.post("/notifications/me/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.update(userNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(userNotificationsTable.id, id), eq(userNotificationsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

router.delete("/notifications/me/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(userNotificationsTable)
    .where(and(eq(userNotificationsTable.id, id), eq(userNotificationsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// ─── Price Alerts ───────────────────────────────────────────────────────────
router.get("/alerts/me", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(priceAlertsTable)
    .where(eq(priceAlertsTable.userId, req.user!.id))
    .orderBy(desc(priceAlertsTable.createdAt));
  res.json({ items: rows });
});

router.post("/alerts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { coinSymbol, condition, targetPrice, triggerOnce, note } = req.body ?? {};
  if (typeof coinSymbol !== "string" || !coinSymbol.trim()) { res.status(400).json({ error: "coinSymbol required" }); return; }
  if (condition !== "above" && condition !== "below") { res.status(400).json({ error: "condition must be above|below" }); return; }
  const tp = Number(targetPrice);
  if (!Number.isFinite(tp) || tp <= 0) { res.status(400).json({ error: "targetPrice must be > 0" }); return; }

  // Cap per user to prevent abuse
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(priceAlertsTable)
    .where(and(eq(priceAlertsTable.userId, userId), eq(priceAlertsTable.status, "active")));
  if (n >= 50) { res.status(429).json({ error: "max 50 active alerts" }); return; }

  const [row] = await db.insert(priceAlertsTable).values({
    userId,
    coinSymbol: coinSymbol.toUpperCase().slice(0, 20),
    condition,
    targetPrice: String(tp),
    triggerOnce: triggerOnce !== false,
    note: typeof note === "string" ? note.slice(0, 200) : null,
  }).returning();
  res.json({ alert: row });
});

router.patch("/alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.status === "string" && ["active", "paused", "triggered"].includes(req.body.status)) updates.status = req.body.status;
  if (req.body?.targetPrice != null) {
    const tp = Number(req.body.targetPrice);
    if (!Number.isFinite(tp) || tp <= 0) { res.status(400).json({ error: "bad targetPrice" }); return; }
    updates.targetPrice = String(tp);
  }
  if (req.body?.condition === "above" || req.body?.condition === "below") updates.condition = req.body.condition;
  if (typeof req.body?.note === "string") updates.note = req.body.note.slice(0, 200);
  if (typeof req.body?.triggerOnce === "boolean") updates.triggerOnce = req.body.triggerOnce;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "nothing to update" }); return; }

  const [row] = await db.update(priceAlertsTable).set(updates)
    .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, req.user!.id)))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ alert: row });
});

router.delete("/alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(priceAlertsTable)
    .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// Test helper: send a sample notification to current user
router.post("/notifications/me/test", requireAuth, async (req, res): Promise<void> => {
  await notify({
    userId: req.user!.id,
    kind: "info",
    category: "system",
    title: "Test notification",
    body: "Yeh ek sample notification hai. Bell icon mein dikh raha hoga!",
  });
  res.json({ ok: true });
});

export default router;
