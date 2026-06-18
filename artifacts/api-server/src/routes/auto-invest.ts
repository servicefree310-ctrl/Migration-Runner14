/**
 * Auto-Invest wallet API  —  INR-only
 *
 * GET  /auto-invest/account          — account status (balance in INR)
 * POST /auto-invest/deposit          — deposit from INR wallet (min ₹5,000)
 * POST /auto-invest/withdraw         — withdraw back to INR wallet
 * PATCH /auto-invest/settings        — reinvest_mode / pause / resume
 * GET  /auto-invest/trades           — recent AI trades (pnlUsdt + inrRate for display)
 * GET  /auto-invest/summary          — 24h P&L in INR
 */

import { Router, type IRouter } from "express";
import {
  db,
  autoInvestAccountsTable,
  autoInvestTradesTable,
  walletsTable,
  walletLedgerTable,
  coinsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";

const router: IRouter = Router();

const MIN_DEPOSIT_INR = 100; // ₹100 minimum

async function getInrCoin() {
  const [c] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
  return c ?? null;
}

async function getOrCreateAccount(userId: number) {
  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);
  if (acct) return acct;
  const rate = (0.5 + Math.random() * 0.5).toFixed(4);
  const [created] = await db.insert(autoInvestAccountsTable)
    .values({ userId, dailyRatePct: rate }).returning();
  return created;
}

/* ── GET /auto-invest/account ────────────────────────────────────────────── */
router.get("/auto-invest/account", requireAuth, async (req: any, res): Promise<void> => {
  const userId  = req.user.id;
  const acct    = await getOrCreateAccount(userId);
  const inrCoin = await getInrCoin();
  const inrRate = getInrRate() || 84;

  let inrWalletBalance = 0;
  if (inrCoin) {
    // Read from the fiat "inr" wallet (bank/UPI deposits), not the spot trading wallet
    const [w] = await db.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, inrCoin.id), eq(walletsTable.walletType, "inr")))
      .limit(1);
    inrWalletBalance = parseFloat(w?.balance ?? "0");
  }

  res.json({
    id:             acct.id,
    balance:        parseFloat(acct.balance),          // stored in INR
    totalDeposited: parseFloat(acct.totalDeposited),   // INR
    totalWithdrawn: parseFloat(acct.totalWithdrawn),   // INR
    totalEarned:    parseFloat(acct.totalEarned),      // INR
    dailyRatePct:   parseFloat(acct.dailyRatePct),
    status:         acct.status,
    createdAt:      acct.createdAt instanceof Date ? acct.createdAt.toISOString() : acct.createdAt,
    inrWalletBalance,   // user's INR wallet balance
    inrRate,            // for converting trade pnlUsdt → INR in UI
  });
});

/* ── POST /auto-invest/deposit ───────────────────────────────────────────── */
router.post("/auto-invest/deposit", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const amount = parseFloat(req.body?.amount);

  if (!amount || isNaN(amount) || amount < MIN_DEPOSIT_INR) {
    res.status(400).json({ error: `Minimum deposit is ₹${MIN_DEPOSIT_INR.toLocaleString("en-IN")}` }); return;
  }

  const inrCoin = await getInrCoin();
  if (!inrCoin) { res.status(500).json({ error: "INR coin not found" }); return; }

  await db.transaction(async tx => {
    // Debit from fiat "inr" wallet (bank/UPI deposits)
    const [wallet] = await tx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, inrCoin.id), eq(walletsTable.walletType, "inr")))
      .limit(1);

    if (!wallet || parseFloat(wallet.balance) < amount) {
      const e: any = new Error("Insufficient INR balance"); e.code = 400; throw e;
    }

    const balBefore = wallet.balance;
    const balAfter  = (parseFloat(balBefore) - amount).toFixed(4);

    await tx.update(walletsTable)
      .set({ balance: balAfter, updatedAt: new Date() })
      .where(eq(walletsTable.id, wallet.id));

    await tx.insert(walletLedgerTable).values({
      userId, coinId: inrCoin.id, walletType: "inr",
      type: "transfer_out", amount: String(-amount),
      balanceBefore: balBefore, balanceAfter: balAfter,
      refId: `auto_invest_deposit_${userId}_${Date.now()}`,
      note: `Auto-invest deposit: ₹${amount.toFixed(2)}`,
    });

    const acct = await getOrCreateAccount(userId);
    await tx.update(autoInvestAccountsTable).set({
      balance:        sql`${autoInvestAccountsTable.balance} + ${amount.toFixed(4)}`,
      totalDeposited: sql`${autoInvestAccountsTable.totalDeposited} + ${amount.toFixed(4)}`,
      status:         "active",
      updatedAt:      new Date(),
    }).where(eq(autoInvestAccountsTable.id, acct.id));
  });

  const acct = await getOrCreateAccount(userId);
  res.json({ success: true, balance: parseFloat(acct.balance) });
});

/* ── POST /auto-invest/withdraw ──────────────────────────────────────────── */
router.post("/auto-invest/withdraw", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const amount = parseFloat(req.body?.amount);

  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid withdrawal amount" }); return;
  }

  const inrCoin = await getInrCoin();
  if (!inrCoin) { res.status(500).json({ error: "INR coin not found" }); return; }

  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);

  if (!acct) { res.status(404).json({ error: "Auto-invest account not found" }); return; }

  const currentBal = parseFloat(acct.balance);
  if (currentBal < amount) {
    res.status(400).json({ error: "Insufficient auto-invest balance" }); return;
  }

  const remaining = currentBal - amount;

  await db.transaction(async tx => {
    await tx.update(autoInvestAccountsTable).set({
      balance:        String(remaining.toFixed(4)),
      totalWithdrawn: sql`${autoInvestAccountsTable.totalWithdrawn} + ${amount.toFixed(4)}`,
      status:         remaining < MIN_DEPOSIT_INR ? "paused" : acct.status,
      updatedAt:      new Date(),
    }).where(eq(autoInvestAccountsTable.id, acct.id));

    // Credit back to fiat "inr" wallet (bank/UPI wallet)
    const [wallet] = await tx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, inrCoin.id), eq(walletsTable.walletType, "inr")))
      .limit(1);

    const balBefore = wallet?.balance ?? "0";
    const balAfter  = (parseFloat(balBefore) + amount).toFixed(4);

    if (wallet) {
      await tx.update(walletsTable).set({ balance: balAfter, updatedAt: new Date() }).where(eq(walletsTable.id, wallet.id));
    } else {
      // Auto-create the inr wallet if missing (race-safe)
      await tx.insert(walletsTable)
        .values({ userId, coinId: inrCoin.id, walletType: "inr", balance: balAfter, locked: "0" })
        .onConflictDoUpdate({
          target: [walletsTable.userId, walletsTable.coinId, walletsTable.walletType],
          set: { balance: sql`wallets.balance + ${amount.toFixed(4)}`, updatedAt: new Date() },
        });
    }

    await tx.insert(walletLedgerTable).values({
      userId, coinId: inrCoin.id, walletType: "inr",
      type: "transfer_in", amount: String(amount),
      balanceBefore: balBefore, balanceAfter: balAfter,
      refId: `auto_invest_withdrawal_${userId}_${Date.now()}`,
      note: `Auto-invest withdrawal: ₹${amount.toFixed(2)}`,
    });
  });

  const [updated] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);
  res.json({ success: true, balance: parseFloat(updated?.balance ?? "0") });
});

/* ── PATCH /auto-invest/settings ─────────────────────────────────────────── */
router.patch("/auto-invest/settings", requireAuth, async (req: any, res): Promise<void> => {
  const userId = req.user.id;
  const { status } = req.body ?? {};

  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);
  if (!acct) { res.status(404).json({ error: "Account not found" }); return; }

  const upd: Record<string, any> = { updatedAt: new Date() };
  if (status === "active" || status === "paused") upd.status = status;

  const [updated] = await db.update(autoInvestAccountsTable).set(upd)
    .where(eq(autoInvestAccountsTable.id, acct.id)).returning();
  res.json({ status: updated.status });
});

/* ── GET /auto-invest/trades ─────────────────────────────────────────────── */
router.get("/auto-invest/trades", requireAuth, async (req: any, res): Promise<void> => {
  const userId  = req.user.id;
  const limit   = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
  const inrRate = getInrRate() || 84;

  const trades = await db.select().from(autoInvestTradesTable)
    .where(eq(autoInvestTradesTable.userId, userId))
    .orderBy(desc(autoInvestTradesTable.closedAt))
    .limit(limit);

  res.json(trades.map(t => ({
    id:         t.id,
    pair:       t.pair,
    side:       t.side,
    strategy:   t.strategy,
    entryPrice: parseFloat(t.entryPrice),
    exitPrice:  parseFloat(t.exitPrice),
    amountUsdt: parseFloat(t.amountUsdt),
    pnlUsdt:    parseFloat(t.pnlUsdt),
    pnlInr:     parseFloat(t.pnlUsdt) * inrRate,
    pnlPct:     parseFloat(t.pnlPct),
    isWin:      t.isWin,
    openedAt:   t.openedAt instanceof Date ? t.openedAt.toISOString() : t.openedAt,
    closedAt:   t.closedAt instanceof Date ? t.closedAt.toISOString() : t.closedAt,
  })));
});

/* ── GET /auto-invest/summary ────────────────────────────────────────────── */
router.get("/auto-invest/summary", requireAuth, async (req: any, res): Promise<void> => {
  const userId  = req.user.id;
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const inrRate = getInrRate() || 84;

  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, userId)).limit(1);

  const recent = await db.select().from(autoInvestTradesTable)
    .where(and(eq(autoInvestTradesTable.userId, userId), gte(autoInvestTradesTable.closedAt, since24)));

  const wins    = recent.filter(t => t.isWin).length;
  const pnl24h  = recent.reduce((s, t) => s + parseFloat(t.pnlUsdt) * inrRate, 0); // in INR

  res.json({
    totalEarned:  parseFloat(acct?.totalEarned ?? "0"),   // INR
    balance:      parseFloat(acct?.balance ?? "0"),        // INR
    pnl24h,
    trades24h:    recent.length,
    wins24h:      wins,
    losses24h:    recent.length - wins,
    winRate24h:   recent.length > 0 ? (wins / recent.length) * 100 : 0,
    dailyRatePct: parseFloat(acct?.dailyRatePct ?? "0.75"),
    inrRate,
  });
});

export default router;
