import { Router, type IRouter } from "express";
import { db, aiTradingPlansTable, aiTradingSubscriptionsTable, aiTradingEarningsTable, walletsTable, coinsTable, usersTable, walletLedgerTable, settingsTable } from "@workspace/db";
import { eq, and, desc, count, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";
import { COMPANY_NAME, COMPANY_SHORT, COMPANY_CIN, COMPANY_GST, COMPANY_ADDRESS } from "../lib/company";

const AI_TDS_RATE = 0.01; // 1% India VDA TDS, applied to realized profit only

/* ── Public rate endpoint ── */

const router: IRouter = Router();

/* ── helpers ── */

async function getSpotWallet(userId: number, symbol: string, anyDb: any = db) {
  const [coin] = await anyDb.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return null;
  const [wallet] = await anyDb.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  return wallet ? { ...wallet, coinId: coin.id } : { coinId: coin.id, balance: "0", locked: "0", id: null };
}

async function upsertSpotWallet(userId: number, symbol: string, balance: string, locked: string, anyDb: any = db) {
  const [coin] = await anyDb.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, symbol)).limit(1);
  if (!coin) return;
  const [existing] = await anyDb.select({ id: walletsTable.id }).from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, coin.id)))
    .limit(1);
  if (existing) {
    await anyDb.update(walletsTable).set({ balance, locked, updatedAt: new Date() })
      .where(eq(walletsTable.id, existing.id));
  } else {
    await anyDb.insert(walletsTable).values({ userId, walletType: "spot", coinId: coin.id, balance, locked });
  }
}

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

function serializeSub(s: any, plan: any) {
  const invested = parseFloat(s.investedAmount);
  const dailyPct = parseFloat(plan.dailyReturnPercent);
  const noExpire = s.expiresAt == null;
  // Authoritative earnings come from the credit engine (persisted on the row).
  // Using the stored value freezes accrual when a bot is stopped/completed,
  // instead of growing forever from elapsed wall-clock time.
  const totalEarned = parseFloat(s.totalEarned ?? "0");
  return {
    id: s.id, planId: s.planId, planName: plan.name, riskLevel: plan.riskLevel,
    investedAmount: invested, currentValue: parseFloat((invested + totalEarned).toFixed(2)),
    startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : s.startedAt,
    expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : (s.expiresAt ?? null),
    noExpire,
    durationDays: plan.durationDays,
    dailyReturnPercent: dailyPct,
    status: s.status, totalEarned: parseFloat(totalEarned.toFixed(2)),
    dailyReturn: parseFloat((invested * dailyPct / 100).toFixed(2)),
  };
}

/* ── routes ── */

router.get("/rates", (_req, res): void => {
  res.json({ inrRate: getInrRate() });
});

/* ── Public platform stats (hero section) ─────────────────────────────── */
router.get("/ai-trading/platform-stats", async (_req, res): Promise<void> => {
  const [{ realBots }] = await db.select({ realBots: count() }).from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.status, "active"));

  const all = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of all) map[r.key] = r.value ?? "";

  const baseVolume = parseFloat(map["ai_hero_base_volume"] ?? "284000000");
  const baseBots   = parseInt(map["ai_hero_base_bots"]   ?? "12000", 10);
  const winRate    = parseFloat(map["ai_hero_win_rate"]   ?? "74.6");
  const avgApy     = parseFloat(map["ai_hero_avg_apy"]    ?? "156");

  res.json({
    totalVolume: baseVolume,
    activeBots:  baseBots + realBots,
    winRate,
    avgApy,
    realBots,
    baseBots,
  });
});

router.get("/ai-trading/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable)
    .where(eq(aiTradingPlansTable.isActive, true))
    .orderBy(desc(aiTradingPlansTable.dailyReturnPercent));
  const out = await Promise.all(plans.map(async p => {
    const [r] = await db.select({ count: count() }).from(aiTradingSubscriptionsTable)
      .where(and(eq(aiTradingSubscriptionsTable.planId, p.id), eq(aiTradingSubscriptionsTable.status, "active")));
    return serializePlan(p, r.count);
  }));
  res.json(out);
});

router.get("/ai-trading/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const subs = await db.select().from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingSubscriptionsTable.createdAt));
  const out = await Promise.all(subs.map(async s => {
    const [plan] = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.id, s.planId));
    return plan ? serializeSub(s, plan) : null;
  }));
  res.json(out.filter(Boolean));
});

router.get("/ai-trading/earnings", requireAuth, async (req, res): Promise<void> => {
  const limit  = Math.min(200, parseInt(req.query.limit  as string ?? "100", 10) || 100);
  const offset =               parseInt(req.query.offset as string ?? "0",  10) || 0;
  const rows = await db.select().from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id))
    .orderBy(desc(aiTradingEarningsTable.creditedAt))
    .limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: count() }).from(aiTradingEarningsTable)
    .where(eq(aiTradingEarningsTable.userId, req.user!.id));
  res.json({
    earnings: rows.map(r => ({
      id:             r.id,
      subscriptionId: r.subscriptionId,
      planName:       r.planName,
      amountUsdt:     parseFloat(r.amountUsdt),
      creditedAt:     r.creditedAt instanceof Date ? r.creditedAt.toISOString() : r.creditedAt,
    })),
    total,
    limit,
    offset,
  });
});

/* GET /api/ai-trading/pnl-summary — full aggregate P&L (not paginated).
 *
 * Net P&L comes from subscriptions.total_earned — this is the canonical
 * value updated atomically by the credit engine on every tick (and matches
 * the "Total Earned" header stat).  Win/loss COUNTS come from the
 * ai_trading_earnings log table which records individual credit events.
 * Using two sources keeps both the headline number and the credit-level
 * breakdown accurate even when historical seed data exists. */
router.get("/ai-trading/pnl-summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  // ── 1. Canonical net P&L from subscriptions.total_earned ─────────────
  // This is the authoritative total — updated atomically by the credit
  // engine and matches the "Total Earned" header on the UI.
  const [subRow] = await db.execute(sql`
    SELECT COALESCE(SUM(total_earned::numeric), 0) AS net
    FROM ai_trading_subscriptions
    WHERE user_id = ${userId}
  `).then(r => r.rows as Array<{ net: string }>);

  // ── 2. Per-credit profit / loss / counts from the earnings log ─────────
  // Individual credit events — used for breakdown cards & win-rate.
  const [logRow] = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN amount_usdt::numeric > 0 THEN amount_usdt::numeric ELSE 0 END), 0)  AS profit,
      COALESCE(SUM(CASE WHEN amount_usdt::numeric < 0 THEN amount_usdt::numeric ELSE 0 END), 0)  AS loss,
      COUNT(CASE WHEN amount_usdt::numeric > 0 THEN 1 END)::int                                  AS wins,
      COUNT(CASE WHEN amount_usdt::numeric < 0 THEN 1 END)::int                                  AS losses,
      COUNT(*)::int                                                                               AS total
    FROM ai_trading_earnings
    WHERE user_id = ${userId}
  `).then(r => r.rows as Array<{
    profit: string; loss: string; wins: number; losses: number; total: number;
  }>);

  const net      = parseFloat(subRow?.net       ?? "0");
  const profit   = parseFloat(logRow?.profit    ?? "0");
  const loss     = parseFloat(logRow?.loss      ?? "0");
  const wins     = logRow?.wins    ?? 0;
  const losses   = logRow?.losses  ?? 0;
  const total    = logRow?.total   ?? 0;
  const winRate  = total > 0 ? (wins / total) * 100 : 0;

  // net = canonical total (subscriptions); profit/loss/wins/losses = per-credit log
  res.json({ profit, loss, net, wins, losses, total, winRate });
});

router.post("/ai-trading/subscribe", requireAuth, async (req, res): Promise<void> => {
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to subscribe to AI trading plans." });
    return;
  }
  const { planId, amount, currency, noExpire } = req.body;
  if (!planId || !amount || amount <= 0) { res.status(400).json({ error: "Invalid input" }); return; }

  const [plan] = await db.select().from(aiTradingPlansTable)
    .where(and(eq(aiTradingPlansTable.id, planId), eq(aiTradingPlansTable.isActive, true)));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const min = parseFloat(plan.minInvestment), max = parseFloat(plan.maxInvestment);
  const expiresAt = noExpire ? null : new Date(Date.now() + plan.durationDays * 86400000);
  const userId = req.user!.id;

  if (currency === "INR") {
    const inrRate   = getInrRate();
    const usdtEquiv = amount / inrRate;
    if (usdtEquiv < min || usdtEquiv > max) {
      res.status(400).json({ error: `USDT equivalent must be between $${min}–$${max} (₹${(min * inrRate).toFixed(0)}–₹${(max * inrRate).toFixed(0)})` });
      return;
    }
    // Pre-flight balance check (outside tx, for a fast fail before acquiring locks)
    const inrPreCheck = await getSpotWallet(userId, "INR");
    if (parseFloat(inrPreCheck?.balance ?? "0") < amount) {
      res.status(400).json({ error: `Insufficient INR balance. Need ₹${amount.toFixed(2)}, have ₹${parseFloat(inrPreCheck?.balance ?? "0").toFixed(2)}` });
      return;
    }
    const sub = await db.transaction(async (tx) => {
      // Re-read INR wallet inside tx with a row-level lock (FOR UPDATE) so
      // concurrent subscribe requests on the same account cannot double-spend.
      const [inrW] = await tx
        .select()
        .from(walletsTable)
        .innerJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
        .where(and(
          eq(walletsTable.userId, userId),
          eq(walletsTable.walletType, "spot"),
          eq(coinsTable.symbol, "INR"),
        ))
        .for("update")
        .limit(1);
      if (!inrW) throw Object.assign(new Error("INR spot wallet not found"), { code: 400 });
      const inrWallet = inrW.wallets;
      const inrAvail  = parseFloat(inrWallet.balance ?? "0");
      if (inrAvail < amount) throw Object.assign(new Error(`Insufficient INR balance. Need ₹${amount.toFixed(2)}, have ₹${inrAvail.toFixed(2)}`), { code: 400 });

      // Deduct INR balance using SQL expression — the INR is spent (not locked).
      // The subscription is tracked in USDT-equivalent units; on expiry/cancel
      // the credit engine returns that USDT amount from the exchange's liquidity.
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${amount}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, inrWallet.id));

      const [created] = await tx.insert(aiTradingSubscriptionsTable).values({
        userId, planId,
        investedAmount: String(usdtEquiv.toFixed(8)),
        fundingCoinId: inrWallet.coinId,
        fundingAmount: String(amount.toFixed(8)),
        expiresAt, status: "active", totalEarned: "0",
      }).returning();

      await tx.insert(walletLedgerTable).values({
        userId, coinId: inrWallet.coinId, walletType: "spot", type: "ai_principal_lock",
        amount: String(-amount),
        balanceBefore: inrWallet.balance,
        balanceAfter: String(inrAvail - amount),
        refType: "ai_subscription", refId: String(created.id),
        note: `AI plan: ${plan.name} (INR funded, ≈$${usdtEquiv.toFixed(2)} USDT)`,
      });

      return created;
    });
    res.status(201).json(serializeSub(sub, plan));
    return;
  }

  if (amount < min || amount > max) { res.status(400).json({ error: `Amount must be between $${min} and $${max}` }); return; }
  // Pre-flight balance check (outside tx, for a fast fail)
  const preCheck = await getSpotWallet(userId, "USDT");
  if (parseFloat(preCheck?.balance ?? "0") < amount) {
    res.status(400).json({ error: "Insufficient USDT balance" }); return;
  }
  const sub = await db.transaction(async (tx) => {
    // SELECT FOR UPDATE so concurrent subscribe requests cannot double-spend.
    const [usdtW] = await tx
      .select()
      .from(walletsTable)
      .innerJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
      .where(and(
        eq(walletsTable.userId, userId),
        eq(walletsTable.walletType, "spot"),
        eq(coinsTable.symbol, "USDT"),
      ))
      .for("update")
      .limit(1);
    if (!usdtW) throw Object.assign(new Error("USDT spot wallet not found"), { code: 400 });
    const wallet = usdtW.wallets;
    const avail  = parseFloat(wallet.balance ?? "0");
    if (avail < amount) throw Object.assign(new Error("Insufficient USDT balance"), { code: 400 });

    // Use SQL expressions so the update is atomic even under concurrent load.
    await tx.update(walletsTable).set({
      balance:   sql`${walletsTable.balance} - ${amount}`,
      locked:    sql`${walletsTable.locked}  + ${amount}`,
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, wallet.id));

    const [created] = await tx.insert(aiTradingSubscriptionsTable).values({
      userId, planId, investedAmount: String(amount),
      fundingCoinId: wallet.coinId,
      fundingAmount: String(amount),
      expiresAt, status: "active", totalEarned: "0",
    }).returning();
    await tx.insert(walletLedgerTable).values({
      userId, coinId: wallet.coinId, walletType: "spot", type: "ai_principal_lock",
      amount: String(-amount), balanceBefore: wallet.balance, balanceAfter: String(avail - amount),
      refType: "ai_subscription", refId: String(created.id), note: `AI plan: ${plan.name}`,
    });
    return created;
  });

  res.status(201).json(serializeSub(sub, plan));
});

router.post("/ai-trading/subscriptions/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const userId = req.user!.id;
  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, userId)));
  if (!sub || sub.status !== "active") { res.status(404).json({ error: "Not found" }); return; }

  // Use the exact funding coin/amount stored at subscription time when available.
  // Legacy subscriptions (created before these columns existed) fall back to USDT.
  const refundCoinId = sub.fundingCoinId ?? null;
  const refundAmount = parseFloat(sub.fundingAmount ?? sub.investedAmount);

  await db.transaction(async (tx) => {
    if (refundCoinId != null) {
      // New-style subscription: return exactly what was deducted at subscribe time.
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.walletType, "spot"), eq(walletsTable.coinId, refundCoinId)))
        .for("update").limit(1);
      if (w) {
        const balBefore = w.balance ?? "0";
        await tx.update(walletsTable).set({
          balance:   sql`${walletsTable.balance} + ${refundAmount}`,
          locked:    sql`GREATEST(0, ${walletsTable.locked} - ${refundAmount})`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
        await tx.insert(walletLedgerTable).values({
          userId, coinId: w.coinId, walletType: "spot", type: "ai_principal_return",
          amount: String(refundAmount), balanceBefore: balBefore,
          balanceAfter: String(parseFloat(balBefore) + refundAmount),
          refType: "ai_subscription", refId: String(id), note: "AI plan cancelled — principal returned",
        });
      } else {
        // Wallet for the funding coin doesn't exist yet — create and credit.
        await tx.insert(walletsTable).values({
          userId, coinId: refundCoinId, walletType: "spot",
          balance: String(refundAmount), locked: "0",
        });
      }
    } else {
      // Legacy subscription (fundingCoinId not recorded): fall back to USDT.
      const invested = parseFloat(sub.investedAmount);
      const [usdtW] = await tx
        .select()
        .from(walletsTable)
        .innerJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
        .where(and(
          eq(walletsTable.userId, userId),
          eq(walletsTable.walletType, "spot"),
          eq(coinsTable.symbol, "USDT"),
        ))
        .for("update")
        .limit(1);

      if (usdtW) {
        const wallet    = usdtW.wallets;
        const balBefore = wallet.balance ?? "0";
        await tx.update(walletsTable).set({
          balance:   sql`${walletsTable.balance} + ${invested}`,
          locked:    sql`GREATEST(0, ${walletsTable.locked} - ${invested})`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, wallet.id));
        await tx.insert(walletLedgerTable).values({
          userId, coinId: wallet.coinId, walletType: "spot", type: "ai_principal_return",
          amount: String(invested), balanceBefore: balBefore,
          balanceAfter: String(parseFloat(balBefore) + invested),
          refType: "ai_subscription", refId: String(id), note: "AI plan cancelled — principal returned",
        });
      } else {
        const [coin] = await tx.select({ id: coinsTable.id }).from(coinsTable)
          .where(eq(coinsTable.symbol, "USDT")).limit(1);
        if (coin) {
          await tx.insert(walletsTable).values({
            userId, coinId: coin.id, walletType: "spot",
            balance: String(invested), locked: "0",
          });
        }
      }
    }

    await tx.update(aiTradingSubscriptionsTable).set({ status: "cancelled" })
      .where(eq(aiTradingSubscriptionsTable.id, id));
  });

  res.json({ success: true });
});

/* ── Invoice / statement for an AI-trading bot subscription ──
 * Covers the full lifecycle of one bot: the BUY (principal invested),
 * its current STATUS (active / cancelled / completed) and realized
 * PROFIT & LOSS (total earned, TDS on profit, net). Returns figures in
 * both USDT and INR, mirroring the spot order invoice. */
router.get("/ai-trading/subscriptions/:id/invoice", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid subscription id" }); return; }
  const userId = req.user!.id;

  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, userId))).limit(1);
  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }

  const [plan] = await db.select().from(aiTradingPlansTable).where(eq(aiTradingPlansTable.id, sub.planId)).limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [{ payouts }] = await db.select({ payouts: count() }).from(aiTradingEarningsTable)
    .where(and(eq(aiTradingEarningsTable.subscriptionId, id), eq(aiTradingEarningsTable.userId, userId)));

  const principalUsdt   = parseFloat(sub.investedAmount);
  const grossProfitUsdt = parseFloat(sub.totalEarned ?? "0");
  const tdsUsdt         = grossProfitUsdt > 0 ? +(grossProfitUsdt * AI_TDS_RATE).toFixed(8) : 0;
  const netProfitUsdt   = +(grossProfitUsdt - tdsUsdt).toFixed(8);
  const roiPct          = principalUsdt > 0 ? +((grossProfitUsdt / principalUsdt) * 100).toFixed(2) : 0;
  // Principal is returned to the wallet only once the bot is no longer active.
  const principalReturned = sub.status !== "active";
  const payoutUsdt        = +((principalReturned ? principalUsdt : 0) + netProfitUsdt).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);
  const iso     = (d: any) => (d instanceof Date ? d.toISOString() : (d ?? null));

  const statusLabel =
    sub.status === "cancelled" ? "Bot Stopped (Cancelled)" :
    sub.status === "completed" ? "Bot Completed (Matured)"  :
    "Bot Active";

  res.json({
    invoiceNo: `AIT-${String(sub.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    type:      "ai_trading",
    exchange: {
      name:  COMPANY_NAME,
      short: COMPANY_SHORT,
      legal: `${COMPANY_NAME} — AI Trading Statement & Tax Invoice`,
      cin:   COMPANY_CIN,
      gst:   COMPANY_GST,
      address: COMPANY_ADDRESS,
    },
    user: {
      id:    user?.id,
      name:  user?.name ?? user?.email ?? "Customer",
      email: user?.email ?? "",
    },
    bot: {
      subscriptionId:     sub.id,
      planName:           plan?.name ?? "AI Trading Bot",
      riskLevel:          plan?.riskLevel ?? null,
      dailyReturnPercent: plan ? parseFloat(plan.dailyReturnPercent) : null,
      durationDays:       plan?.durationDays ?? null,
      status:             sub.status,
      statusLabel,
      payouts,
      startedAt:          iso(sub.startedAt),
      expiresAt:          iso(sub.expiresAt),
      lastCreditedAt:     iso(sub.lastCreditedAt),
    },
    charges: {
      tdsEnabled: true,
      tdsRatePct: AI_TDS_RATE * 100,
      tdsNote:    "TDS applies on realized profit only",
    },
    totals: {
      principalUsdt:    +principalUsdt.toFixed(8),
      grossProfitUsdt:  +grossProfitUsdt.toFixed(8),
      tdsUsdt,
      netProfitUsdt,
      principalReturned,
      payoutUsdt,
      roiPct,
      principalInr:   toInr(principalUsdt),
      grossProfitInr: toInr(grossProfitUsdt),
      tdsInr:         toInr(tdsUsdt),
      netProfitInr:   toInr(netProfitUsdt),
      payoutInr:      toInr(payoutUsdt),
      inrRate,
    },
    legend: grossProfitUsdt >= 0
      ? "Net Profit = Gross Profit − TDS. Payout = Returned Principal + Net Profit."
      : "Loss recorded on this bot. Net = Gross Profit (no TDS on losses).",
  });
});

/* ─────────────────────── AI Trading Statement ───────────────────────────── */
/* GET /api/ai-trading/statement?from=YYYY-MM-DD&to=YYYY-MM-DD               */
router.get("/ai-trading/statement", requireAuth, async (req: any, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await getInrRate();

  const fromStr = typeof req.query.from === "string" ? req.query.from : undefined;
  const toStr   = typeof req.query.to   === "string" ? req.query.to   : undefined;
  const now     = new Date();
  const from    = fromStr ? new Date(fromStr + "T00:00:00Z") : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to      = toStr   ? new Date(toStr   + "T23:59:59Z") : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: "Invalid date range" }); return;
  }

  /* Subscriptions started in range (join with plan for name/risk) */
  const subs = await db
    .select({
      id:               aiTradingSubscriptionsTable.id,
      planId:           aiTradingSubscriptionsTable.planId,
      investedAmount:   aiTradingSubscriptionsTable.investedAmount,
      totalEarned:      aiTradingSubscriptionsTable.totalEarned,
      status:           aiTradingSubscriptionsTable.status,
      startedAt:        aiTradingSubscriptionsTable.startedAt,
      expiresAt:        aiTradingSubscriptionsTable.expiresAt,
      lastCreditedAt:   aiTradingSubscriptionsTable.lastCreditedAt,
      planName:         aiTradingPlansTable.name,
      riskLevel:        aiTradingPlansTable.riskLevel,
      dailyReturnPct:   aiTradingPlansTable.dailyReturnPercent,
      durationDays:     aiTradingPlansTable.durationDays,
    })
    .from(aiTradingSubscriptionsTable)
    .leftJoin(aiTradingPlansTable, eq(aiTradingSubscriptionsTable.planId, aiTradingPlansTable.id))
    .where(and(
      eq(aiTradingSubscriptionsTable.userId, userId),
      gte(aiTradingSubscriptionsTable.startedAt, from),
      lte(aiTradingSubscriptionsTable.startedAt, to),
    ))
    .orderBy(desc(aiTradingSubscriptionsTable.startedAt));

  /* Earnings credited in range */
  const subIds = subs.map(s => s.id);
  const earnings = subIds.length
    ? await db.select().from(aiTradingEarningsTable)
        .where(and(
          eq(aiTradingEarningsTable.userId, userId),
          gte(aiTradingEarningsTable.creditedAt, from),
          lte(aiTradingEarningsTable.creditedAt, to),
          inArray(aiTradingEarningsTable.subscriptionId, subIds),
        ))
        .orderBy(desc(aiTradingEarningsTable.creditedAt))
    : [];

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  /* Totals */
  const totalInvested   = subs.reduce((s, x) => s + parseFloat(x.investedAmount ?? "0"), 0);
  const grossProfit     = subs.reduce((s, x) => s + parseFloat(x.totalEarned    ?? "0"), 0);
  const tdsUsdt         = Math.max(0, grossProfit * AI_TDS_RATE);
  const netProfit       = grossProfit - tdsUsdt;
  const roiPct          = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
  const mmYY            = `${String(from.getUTCMonth() + 1).padStart(2, "0")}${from.getUTCFullYear()}`;
  const statementNo     = `AIS-${mmYY}-${String(userId).padStart(6,"0")}`;
  const toInr           = (u: number) => u * inrRate;

  res.json({
    statementNo,
    generatedAt: now.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },
    brand: {
      legalName: COMPANY_NAME, tradingName: COMPANY_SHORT,
      address: COMPANY_ADDRESS, gstin: COMPANY_GST, cin: COMPANY_CIN,
      pan: "AAAAZ0000Z", supportEmail: "support@zebvix.com", website: "https://zebvix.com",
    },
    customer: { name: user?.name ?? user?.email ?? "User", email: user?.email ?? "", userId },
    summary: {
      totalSubscriptions:  subs.length,
      totalEarningsCredits: earnings.length,
      totalInvestedUsdt:   totalInvested,    totalInvestedInr:   toInr(totalInvested),
      grossProfitUsdt:     grossProfit,       grossProfitInr:     toInr(grossProfit),
      tdsPercent:          AI_TDS_RATE * 100, tdsUsdt,            tdsInr: toInr(tdsUsdt),
      netProfitUsdt:       netProfit,         netProfitInr:       toInr(netProfit),
      roiPct,              inrRate,
    },
    subscriptions: subs.map(s => ({
      id:              s.id,
      planName:        s.planName ?? "Unknown Plan",
      riskLevel:       s.riskLevel,
      status:          s.status,
      investedUsdt:    parseFloat(s.investedAmount ?? "0"),
      totalEarnedUsdt: parseFloat(s.totalEarned    ?? "0"),
      roiPct:          parseFloat(s.investedAmount ?? "0") > 0
                         ? (parseFloat(s.totalEarned ?? "0") / parseFloat(s.investedAmount ?? "0")) * 100
                         : 0,
      startedAt:  s.startedAt  instanceof Date ? s.startedAt.toISOString()  : String(s.startedAt),
      expiresAt:  s.expiresAt  instanceof Date ? s.expiresAt.toISOString()  : (s.expiresAt ? String(s.expiresAt) : null),
      lastCreditedAt: s.lastCreditedAt instanceof Date ? s.lastCreditedAt.toISOString() : (s.lastCreditedAt ? String(s.lastCreditedAt) : null),
    })),
    earnings: earnings.map(e => ({
      id:             e.id,
      subscriptionId: e.subscriptionId,
      planName:       e.planName,
      amountUsdt:     parseFloat(e.amountUsdt ?? "0"),
      amountInr:      toInr(parseFloat(e.amountUsdt ?? "0")),
      creditedAt:     e.creditedAt instanceof Date ? e.creditedAt.toISOString() : String(e.creditedAt),
    })),
  });
});

export default router;
