/**
 * Admin: Auto-Invest management
 *
 * GET  /admin/auto-invest/settings            — global config (min deposit, rate range, enabled)
 * PUT  /admin/auto-invest/settings            — update global config
 * GET  /admin/auto-invest/stats               — aggregate stats (TVL, total earned, active accounts)
 * GET  /admin/auto-invest/accounts            — all user accounts + user info
 * PATCH /admin/auto-invest/accounts/:userId   — adjust daily rate, pause/resume, manual credit/debit
 */

import { Router, type IRouter } from "express";
import {
  db,
  autoInvestAccountsTable,
  autoInvestTradesTable,
  usersTable,
  settingsTable,
  walletsTable,
  walletLedgerTable,
  coinsTable,
} from "@workspace/db";
import { eq, desc, count, sum, sql, and } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const requireAdmin = requireRole("admin", "superadmin");

/* ── Setting helpers ─────────────────────────────────────────────────────── */
async function getSetting(key: string, fallback: string) {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row?.value ?? fallback;
}

async function setSetting(key: string, value: string) {
  await db.insert(settingsTable).values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

/* ── GET /admin/auto-invest/settings ─────────────────────────────────────── */
router.get("/admin/auto-invest/settings", requireAdmin, async (_req, res): Promise<void> => {
  const [enabled, minDeposit, rateMin, rateMax, tickMin] = await Promise.all([
    getSetting("auto_invest_enabled",           "true"),
    getSetting("auto_invest_min_deposit_inr",   "100"),
    getSetting("auto_invest_daily_rate_min",    "0.5"),
    getSetting("auto_invest_daily_rate_max",    "1.0"),
    getSetting("auto_invest_tick_interval_min", "3"),
  ]);

  res.json({
    enabled:         enabled === "true",
    minDepositInr:   parseFloat(minDeposit),
    dailyRateMin:    parseFloat(rateMin),
    dailyRateMax:    parseFloat(rateMax),
    tickIntervalMin: parseInt(tickMin, 10),
  });
});

/* ── PUT /admin/auto-invest/settings ─────────────────────────────────────── */
router.put("/admin/auto-invest/settings", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, minDepositInr, dailyRateMin, dailyRateMax, tickIntervalMin } = req.body ?? {};

  if (enabled !== undefined)         await setSetting("auto_invest_enabled",           String(!!enabled));
  if (minDepositInr !== undefined)   await setSetting("auto_invest_min_deposit_inr",   String(parseFloat(minDepositInr)));
  if (dailyRateMin !== undefined)    await setSetting("auto_invest_daily_rate_min",    String(parseFloat(dailyRateMin)));
  if (dailyRateMax !== undefined)    await setSetting("auto_invest_daily_rate_max",    String(parseFloat(dailyRateMax)));
  if (tickIntervalMin !== undefined) await setSetting("auto_invest_tick_interval_min", String(parseInt(tickIntervalMin, 10)));

  res.json({ success: true });
});

/* ── GET /admin/auto-invest/stats ────────────────────────────────────────── */
router.get("/admin/auto-invest/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [activeRow] = await db.select({ count: count() })
    .from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.status, "active"));

  const [allRow] = await db.select({ count: count() }).from(autoInvestAccountsTable);

  const [tvlRow] = await db.select({
    tvl:          sql<string>`COALESCE(SUM(balance::numeric), 0)`,
    totalEarned:  sql<string>`COALESCE(SUM(total_earned::numeric), 0)`,
    totalDeposited: sql<string>`COALESCE(SUM(total_deposited::numeric), 0)`,
  }).from(autoInvestAccountsTable);

  const [tradeRow] = await db.select({ count: count() }).from(autoInvestTradesTable);

  const [winRow] = await db.select({ count: count() }).from(autoInvestTradesTable)
    .where(eq(autoInvestTradesTable.isWin, true));

  res.json({
    activeAccounts:   activeRow.count,
    totalAccounts:    allRow.count,
    tvlInr:           parseFloat(tvlRow?.tvl ?? "0"),
    totalEarnedInr:   parseFloat(tvlRow?.totalEarned ?? "0"),
    totalDepositedInr: parseFloat(tvlRow?.totalDeposited ?? "0"),
    totalTrades:      tradeRow.count,
    winTrades:        winRow.count,
    winRate:          tradeRow.count > 0 ? (winRow.count / tradeRow.count) * 100 : 0,
  });
});

/* ── GET /admin/auto-invest/accounts ─────────────────────────────────────── */
router.get("/admin/auto-invest/accounts", requireAdmin, async (req, res): Promise<void> => {
  const limit  = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const accounts = await db
    .select({
      id:             autoInvestAccountsTable.id,
      userId:         autoInvestAccountsTable.userId,
      balance:        autoInvestAccountsTable.balance,
      totalDeposited: autoInvestAccountsTable.totalDeposited,
      totalWithdrawn: autoInvestAccountsTable.totalWithdrawn,
      totalEarned:    autoInvestAccountsTable.totalEarned,
      dailyRatePct:   autoInvestAccountsTable.dailyRatePct,
      status:         autoInvestAccountsTable.status,
      createdAt:      autoInvestAccountsTable.createdAt,
      updatedAt:      autoInvestAccountsTable.updatedAt,
      userName:       usersTable.name,
      userEmail:      usersTable.email,
    })
    .from(autoInvestAccountsTable)
    .leftJoin(usersTable, eq(usersTable.id, autoInvestAccountsTable.userId))
    .orderBy(desc(autoInvestAccountsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  res.json(accounts.map(a => ({
    ...a,
    balance:        parseFloat(a.balance),
    totalDeposited: parseFloat(a.totalDeposited),
    totalWithdrawn: parseFloat(a.totalWithdrawn),
    totalEarned:    parseFloat(a.totalEarned),
    dailyRatePct:   parseFloat(a.dailyRatePct),
    createdAt:      a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    updatedAt:      a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
  })));
});

/* ── PATCH /admin/auto-invest/accounts/:userId ───────────────────────────── */
router.patch("/admin/auto-invest/accounts/:userId", requireAdmin, async (req: any, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId) || userId <= 0) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { status, dailyRatePct, creditInr, debitInr, note } = req.body ?? {};

  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);
  if (!acct) { res.status(404).json({ error: "Account not found" }); return; }

  const upd: Record<string, any> = { updatedAt: new Date() };
  if (status === "active" || status === "paused") upd.status = status;
  if (dailyRatePct !== undefined) {
    const r = parseFloat(dailyRatePct);
    if (r >= 0.1 && r <= 5) upd.dailyRatePct = r.toFixed(4);
  }

  // Manual credit/debit to auto-invest balance
  if (creditInr !== undefined || debitInr !== undefined) {
    const amt = parseFloat(creditInr ?? debitInr ?? "0");
    const MAX_ADJUSTMENT = 10_000_000; // ₹1 crore safety cap per operation
    if (amt > 0 && amt <= MAX_ADJUSTMENT) {
      const isCredit    = creditInr !== undefined;
      const currentBal  = parseFloat(acct.balance);
      const rawNewBal   = currentBal + (isCredit ? amt : -amt);
      const newBal      = Math.max(0, rawNewBal);  // never below 0
      const actualDelta = newBal - currentBal;      // actual change (clipped for debit)
      upd.balance    = newBal.toFixed(4);
      if (isCredit) upd.totalEarned = (parseFloat(acct.totalEarned) + amt).toFixed(4);

      // Ledger entry — reflects actual balance change
      const [inrCoin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
      if (inrCoin) {
        await db.insert(walletLedgerTable).values({
          userId,
          coinId:        inrCoin.id,
          walletType:    "spot",
          type:          isCredit ? "admin_credit" : "admin_debit",
          amount:        actualDelta.toFixed(4),
          balanceBefore: acct.balance,
          balanceAfter:  newBal.toFixed(4),
          refId:         `admin_auto_invest_${userId}_${Date.now()}`,
          note:          note ?? `Admin ${isCredit ? "credit" : "debit"}: ₹${amt.toFixed(2)} to auto-invest`,
        });
      }
    } else if (amt > MAX_ADJUSTMENT) {
      res.status(400).json({ error: `Adjustment cannot exceed ₹${MAX_ADJUSTMENT.toLocaleString("en-IN")} per operation` }); return;
    }
  }

  const [updated] = await db.update(autoInvestAccountsTable).set(upd)
    .where(eq(autoInvestAccountsTable.userId, userId)).returning();

  res.json({
    ...updated,
    balance:        parseFloat(updated.balance),
    totalEarned:    parseFloat(updated.totalEarned),
    dailyRatePct:   parseFloat(updated.dailyRatePct),
  });
});

export default router;
