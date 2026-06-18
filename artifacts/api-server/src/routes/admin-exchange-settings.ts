/**
 * Admin Exchange Settings — full key-value config store
 * GET  /api/admin/exchange-settings        → all settings (masked secrets)
 * PUT  /api/admin/exchange-settings        → upsert one key-value
 * POST /api/admin/exchange-settings/bulk   → upsert multiple
 */
import { Router, type IRouter } from "express";
import { db, exchangeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();
const adminAuth = requireRole("admin", "superadmin");

const SECRET_KEYS = ["razorpay_key_secret", "razorpay_webhook_secret", "coingecko_api_key", "binance_api_key"];

function maskSecret(val: string): string {
  if (!val) return "";
  if (val.length <= 4) return "****";
  return val.slice(0, 4) + "••••••••••••";
}

function maskRow(key: string, value: string): string {
  return SECRET_KEYS.includes(key) ? maskSecret(value) : value;
}

/* GET all settings */
router.get("/admin/exchange-settings", adminAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(exchangeSettingsTable).orderBy(exchangeSettingsTable.key);
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = maskRow(r.key, r.value);
  res.json(result);
});

/* PUT single key */
const UpsertSchema = z.object({
  key:   z.string().min(1).max(100),
  value: z.string(),
});

router.put("/admin/exchange-settings", adminAuth, async (req, res): Promise<void> => {
  const parsed = UpsertSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "key and value required" }); return; }
  const { key, value } = parsed.data;

  await db.insert(exchangeSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: exchangeSettingsTable.key, set: { value, updatedAt: new Date() } });
  res.json({ ok: true, key, value: maskRow(key, value) });
});

/* POST bulk upsert */
const BulkSchema = z.object({ settings: z.record(z.string(), z.string()) });

router.post("/admin/exchange-settings/bulk", adminAuth, async (req, res): Promise<void> => {
  const parsed = BulkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "settings object required" }); return; }
  const { settings } = parsed.data;

  const entries = Object.entries(settings);
  if (entries.length === 0) { res.status(400).json({ error: "No settings provided" }); return; }

  for (const [key, value] of entries) {
    await db.insert(exchangeSettingsTable).values({ key, value })
      .onConflictDoUpdate({ target: exchangeSettingsTable.key, set: { value, updatedAt: new Date() } });
  }

  res.json({ ok: true, updated: entries.length });
});

/* DELETE a key */
router.delete("/admin/exchange-settings/:key", adminAuth, async (req, res): Promise<void> => {
  const key = req.params.key as string;
  await db.delete(exchangeSettingsTable).where(eq(exchangeSettingsTable.key, key));
  res.json({ ok: true });
});

export default router;
