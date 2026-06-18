/**
 * Feature Flags
 * GET  /api/exchange/features  — public; returns current flags (cached 30 s)
 * GET  /api/admin/features     — admin; returns flags (no cache)
 * PUT  /api/admin/features     — admin; replace flags
 */
import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();
const adminAuth = requireRole("admin", "superadmin");

export const FEATURE_FLAGS_KEY = "feature_flags";

export type FeatureKey =
  | "spot_trading" | "futures" | "options" | "p2p" | "convert"
  | "ai_trading" | "trading_bots" | "copy_trading" | "earn" | "wallet"
  | "inr_payments" | "leagues" | "price_alerts" | "referrals"
  | "broker" | "smart_api" | "portfolio";

export const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  spot_trading:  true,
  futures:       true,
  options:       true,
  p2p:           true,
  convert:       true,
  ai_trading:    true,
  trading_bots:  true,
  copy_trading:  true,
  earn:          true,
  wallet:        true,
  inr_payments:  true,
  leagues:       true,
  price_alerts:  true,
  referrals:     true,
  broker:        false,
  smart_api:     false,
  portfolio:     true,
};

async function loadFlags(): Promise<Record<FeatureKey, boolean>> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, FEATURE_FLAGS_KEY))
    .limit(1);
  if (!row) return { ...DEFAULT_FLAGS };
  try {
    return { ...DEFAULT_FLAGS, ...(JSON.parse(row.value) as Partial<Record<FeatureKey, boolean>>) };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

/* Public endpoint — 30-second cache */
router.get("/exchange/features", async (_req, res): Promise<void> => {
  try {
    const flags = await loadFlags();
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.json(flags);
  } catch {
    res.status(500).json({ error: "Failed to load feature flags" });
  }
});

/* Admin read */
router.get("/admin/features", adminAuth, async (_req, res): Promise<void> => {
  try {
    const flags = await loadFlags();
    res.json(flags);
  } catch {
    res.status(500).json({ error: "Failed to load feature flags" });
  }
});

const FlagsBodySchema = z.record(z.string(), z.boolean());

/* Admin write */
router.put("/admin/features", adminAuth, async (req, res): Promise<void> => {
  const parsed = FlagsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Body must be a flat object of { featureKey: boolean }" });
    return;
  }
  const merged: Record<FeatureKey, boolean> = { ...DEFAULT_FLAGS, ...parsed.data } as Record<FeatureKey, boolean>;
  const value = JSON.stringify(merged);
  await db
    .insert(settingsTable)
    .values({ key: FEATURE_FLAGS_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  res.json(merged);
});

export default router;
