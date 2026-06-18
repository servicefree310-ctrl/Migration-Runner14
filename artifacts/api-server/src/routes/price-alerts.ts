import { Router, type IRouter } from "express";
import { db, priceAlertsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CreateAlertBody = z.object({
  symbol:      z.string().min(1).max(20).transform(s => s.toUpperCase()),
  condition:   z.enum(["above", "below"]),
  targetPrice: z.number().positive(),
  note:        z.string().max(200).optional(),
});

const UpdateAlertBody = z.object({
  targetPrice: z.number().positive().optional(),
  condition:   z.enum(["above", "below"]).optional(),
  note:        z.string().max(200).nullable().optional(),
});

/* GET /api/price-alerts */
router.get("/price-alerts", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const alerts = await db
    .select()
    .from(priceAlertsTable)
    .where(eq(priceAlertsTable.userId, userId))
    .orderBy(desc(priceAlertsTable.createdAt));
  res.json(alerts);
});

/* POST /api/price-alerts */
router.post("/price-alerts", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { symbol, condition, targetPrice, note } = parsed.data;

  const existing = await db.select({ id: priceAlertsTable.id }).from(priceAlertsTable)
    .where(and(eq(priceAlertsTable.userId, userId), eq(priceAlertsTable.status, "active")));
  if (existing.length >= 20) { res.status(400).json({ error: "Max 20 active alerts" }); return; }

  const [alert] = await db.insert(priceAlertsTable).values({
    userId,
    coinSymbol:  symbol,
    condition,
    targetPrice: String(targetPrice),
    triggerOnce: true,
    status:      "active",
    note:        note ?? null,
  }).returning();
  res.status(201).json(alert);
});

/* DELETE /api/price-alerts/:id */
router.delete("/price-alerts/:id", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(priceAlertsTable).where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)));
  res.json({ success: true });
});

/* PATCH /api/price-alerts/:id/disable */
router.patch("/price-alerts/:id/disable", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(priceAlertsTable)
    .set({ status: "disabled" })
    .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json(row);
});

/* PATCH /api/price-alerts/:id — edit targetPrice, condition, or note */
router.patch("/price-alerts/:id", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user!.id;
  const id = parseInt(req.params.id as string, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }
  const { targetPrice, condition, note } = parsed.data;
  if (targetPrice === undefined && condition === undefined && note === undefined) {
    res.status(400).json({ error: "At least one field (targetPrice, condition, note) is required" });
    return;
  }
  const updates: Record<string, any> = {};
  if (targetPrice !== undefined) updates.targetPrice = String(targetPrice);
  if (condition !== undefined)   updates.condition = condition;
  if (note !== undefined)        updates.note = note ?? null;
  updates.updatedAt = new Date();
  const [row] = await db
    .update(priceAlertsTable)
    .set(updates)
    .where(and(eq(priceAlertsTable.id, id), eq(priceAlertsTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json(row);
});

export default router;
