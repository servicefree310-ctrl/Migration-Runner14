/**
 * Admin Price Alerts
 * GET    /api/admin/price-alerts      — list all (paginated)
 * DELETE /api/admin/price-alerts/:id  — delete an alert
 */
import { Router, type IRouter } from "express";
import { db, priceAlertsTable, usersTable } from "@workspace/db";
import { eq, desc, ilike, or, count } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const adminAuth = requireRole("admin", "superadmin");

router.get("/admin/price-alerts", adminAuth, async (req, res): Promise<void> => {
  const limit  = Math.min(200, parseInt((req.query.limit  as string) ?? "100", 10) || 100);
  const offset =               parseInt((req.query.offset as string) ?? "0",   10) || 0;
  const search = ((req.query.search as string) ?? "").trim();
  const status = (req.query.status as string) ?? "all";

  const rows = await db.select({
    id:          priceAlertsTable.id,
    userId:      priceAlertsTable.userId,
    coinSymbol:  priceAlertsTable.coinSymbol,
    condition:   priceAlertsTable.condition,
    targetPrice: priceAlertsTable.targetPrice,
    status:      priceAlertsTable.status,
    triggeredAt: priceAlertsTable.triggeredAt,
    createdAt:   priceAlertsTable.createdAt,
    userEmail:   usersTable.email,
    userUsername:usersTable.name,
  })
    .from(priceAlertsTable)
    .leftJoin(usersTable, eq(priceAlertsTable.userId, usersTable.id))
    .orderBy(desc(priceAlertsTable.createdAt))
    .limit(limit).offset(offset);

  const filtered = status === "all" ? rows : rows.filter(r => r.status === status);
  const [{ count: total }] = await db.select({ count: count() }).from(priceAlertsTable);
  res.json({ alerts: filtered, total });
});

router.delete("/admin/price-alerts/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(priceAlertsTable).where(eq(priceAlertsTable.id, id));
  res.json({ ok: true });
});

export default router;
