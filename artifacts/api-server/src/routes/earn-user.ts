import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, earnProductsTable, earnPositionsTable, walletsTable, coinsTable, walletLedgerTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getRawTick, getInrRate } from "../lib/price-service";
import { creditTradingFeeReferralChain } from "../lib/trading-fee-referral";

const router: IRouter = Router();

// Public list of active earn products with coin info — used by the user-portal
// Earn page. Admin-only `/admin/earn-products` returns ALL products including
// drafts/inactive; this endpoint filters to status='active' and joins coin meta.
router.get("/earn/products", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: earnProductsTable.id,
      coinId: earnProductsTable.coinId,
      name: earnProductsTable.name,
      description: earnProductsTable.description,
      type: earnProductsTable.type,
      durationDays: earnProductsTable.durationDays,
      apy: earnProductsTable.apy,
      minAmount: earnProductsTable.minAmount,
      maxAmount: earnProductsTable.maxAmount,
      totalCap: earnProductsTable.totalCap,
      currentSubscribed: earnProductsTable.currentSubscribed,
      payoutInterval: earnProductsTable.payoutInterval,
      compounding: earnProductsTable.compounding,
      earlyRedemption: earnProductsTable.earlyRedemption,
      earlyRedemptionPenaltyPct: earnProductsTable.earlyRedemptionPenaltyPct,
      minVipTier: earnProductsTable.minVipTier,
      featured: earnProductsTable.featured,
      displayOrder: earnProductsTable.displayOrder,
      saleStartAt: earnProductsTable.saleStartAt,
      saleEndAt: earnProductsTable.saleEndAt,
      coinSymbol: coinsTable.symbol,
      coinName: coinsTable.name,
      coinIcon: coinsTable.logoUrl,
    })
    .from(earnProductsTable)
    .innerJoin(coinsTable, eq(earnProductsTable.coinId, coinsTable.id))
    .where(eq(earnProductsTable.status, "active"))
    .orderBy(desc(earnProductsTable.featured), desc(earnProductsTable.displayOrder), desc(earnProductsTable.apy));
  res.json(rows);
});

router.get("/earn/positions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select({
      id: earnPositionsTable.id, productId: earnPositionsTable.productId, amount: earnPositionsTable.amount,
      totalEarned: earnPositionsTable.totalEarned,
      autoMaturity: earnPositionsTable.autoMaturity,
      autoRenew: earnPositionsTable.autoMaturity,
      status: earnPositionsTable.status, startedAt: earnPositionsTable.startedAt,
      maturedAt: earnPositionsTable.maturedAt,
      maturityAt: earnPositionsTable.maturedAt,
      closedAt: earnPositionsTable.closedAt,
      coinSymbol: coinsTable.symbol, productName: earnProductsTable.name,
      apy: earnProductsTable.apy, durationDays: earnProductsTable.durationDays,
      type: earnProductsTable.type,
    })
    .from(earnPositionsTable)
    .innerJoin(earnProductsTable, eq(earnPositionsTable.productId, earnProductsTable.id))
    .innerJoin(coinsTable, eq(earnProductsTable.coinId, coinsTable.id))
    .where(eq(earnPositionsTable.userId, userId))
    .orderBy(desc(earnPositionsTable.startedAt));
  res.json(rows);
});

router.post("/earn/subscribe", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const body = req.body ?? {};
  const productId = body.productId;
  const amount = body.amount;
  // Accept both `autoRenew` (frontend canonical) and `autoMaturity` (legacy/db).
  const autoMaturity = body.autoRenew ?? body.autoMaturity;
  const amt = Number(amount);
  if (!productId || !Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: "productId and positive amount required" }); return; }

  // Server-enforced KYC gate — Earn requires at least Level 1. Locked products
  // (durationDays > 0) further require Level 2. UI gates the same way but we
  // must enforce here so direct API calls cannot bypass.
  const userKycLevel = Number(req.user!.kycLevel ?? 0);
  if (userKycLevel < 1) { res.status(403).json({ error: "KYC Level 1 required to subscribe to Earn products" }); return; }

  try {
    const created = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(earnProductsTable).where(eq(earnProductsTable.id, Number(productId))).limit(1);
      if (!p) { const e: any = new Error("Product not found"); e.code = 404; throw e; }
      if (p.status !== "active") { const e: any = new Error("Product not active"); e.code = 400; throw e; }
      if (p.durationDays > 0 && userKycLevel < 2) { const e: any = new Error("Locked Earn products require KYC Level 2"); e.code = 403; throw e; }
      const min = Number(p.minAmount), max = Number(p.maxAmount);
      if (min > 0 && amt < min) { const e: any = new Error(`Min amount is ${min}`); e.code = 400; throw e; }
      if (max > 0 && amt > max) { const e: any = new Error(`Max amount is ${max}`); e.code = 400; throw e; }
      const cap = Number(p.totalCap), used = Number(p.currentSubscribed);
      if (cap > 0 && used + amt > cap) { const e: any = new Error("Product cap reached"); e.code = 400; throw e; }
      if ((req.user!.vipTier ?? 0) < (p.minVipTier ?? 0)) { const e: any = new Error(`Requires VIP ${p.minVipTier}+`); e.code = 403; throw e; }

      // Lock funds: debit spot wallet of product coin, credit earn wallet
      const [src] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "spot")))
        .for("update").limit(1);
      if (!src) { const e: any = new Error("Spot wallet not found"); e.code = 400; throw e; }
      if (Number(src.balance) < amt) { const e: any = new Error(`Insufficient spot balance (${Number(src.balance).toFixed(8)})`); e.code = 400; throw e; }

      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${amt}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, src.id));

      const [earnW] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "earn")))
        .for("update").limit(1);
      if (earnW) {
        await tx.update(walletsTable).set({
          locked: sql`${walletsTable.locked} + ${amt}`, updatedAt: new Date(),
        }).where(eq(walletsTable.id, earnW.id));
      } else {
        await tx.insert(walletsTable).values({ userId, coinId: p.coinId, walletType: "earn", balance: "0", locked: String(amt) });
      }

      // Update product subscribed total
      await tx.update(earnProductsTable).set({
        currentSubscribed: sql`${earnProductsTable.currentSubscribed} + ${amt}`,
      }).where(eq(earnProductsTable.id, p.id));

      const maturedAt = p.durationDays > 0 ? new Date(Date.now() + p.durationDays * 86400_000) : null;
      const spotBalBefore = String(src.balance);
      const spotBalAfter  = String(Number(src.balance) - amt);
      const [pos] = await tx.insert(earnPositionsTable).values({
        userId, productId: p.id, amount: String(amt),
        autoMaturity: !!autoMaturity, status: "active", maturedAt,
      }).returning();

      await tx.insert(walletLedgerTable).values({
        userId, coinId: p.coinId, walletType: "spot", type: "earn_deposit",
        amount: String(-amt), balanceBefore: spotBalBefore, balanceAfter: spotBalAfter,
        refType: "earn_position", refId: String(pos.id), note: `Earn: ${p.name}`,
      });

      return pos;
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.post("/earn/positions/:id/redeem", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  try {
    const result = await db.transaction(async (tx) => {
      const [pos] = await tx.select().from(earnPositionsTable)
        .where(and(eq(earnPositionsTable.id, id), eq(earnPositionsTable.userId, userId)))
        .for("update").limit(1);
      if (!pos) { const e: any = new Error("Position not found"); e.code = 404; throw e; }
      if (pos.status !== "active" && pos.status !== "matured") { const e: any = new Error(`Cannot redeem — status is ${pos.status}`); e.code = 400; throw e; }
      const [p] = await tx.select().from(earnProductsTable).where(eq(earnProductsTable.id, pos.productId)).limit(1);
      if (!p) { const e: any = new Error("Product missing"); e.code = 500; throw e; }

      const principal = Number(pos.amount);
      const apy = Number(p.apy) / 100;
      const elapsedDays = (Date.now() - pos.startedAt.getTime()) / 86400_000;
      const isMatured = pos.maturedAt ? Date.now() >= pos.maturedAt.getTime() : true;
      const earned = principal * apy * elapsedDays / 365;
      let payout = principal + earned;
      let earlyPenalty = 0;
      if (!isMatured && p.durationDays > 0) {
        if (!p.earlyRedemption) { const e: any = new Error("Early redemption not allowed"); e.code = 400; throw e; }
        earlyPenalty = principal * Number(p.earlyRedemptionPenaltyPct) / 100;
        payout = principal + earned - earlyPenalty;
      }

      // Release earn locked, credit spot
      const [earnW] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "earn")))
        .for("update").limit(1);
      if (earnW) {
        await tx.update(walletsTable).set({
          locked: sql`GREATEST(0, ${walletsTable.locked} - ${principal})`, updatedAt: new Date(),
        }).where(eq(walletsTable.id, earnW.id));
      }
      const [spotW] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "spot")))
        .for("update").limit(1);
      const spotWBefore = String(spotW?.balance ?? "0");
      const spotWAfter  = String(Number(spotWBefore) + payout);
      if (spotW) {
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${payout}`, updatedAt: new Date(),
        }).where(eq(walletsTable.id, spotW.id));
      } else {
        await tx.insert(walletsTable).values({ userId, coinId: p.coinId, walletType: "spot", balance: String(payout), locked: "0" });
      }
      await tx.update(earnProductsTable).set({
        currentSubscribed: sql`GREATEST(0, ${earnProductsTable.currentSubscribed} - ${principal})`,
      }).where(eq(earnProductsTable.id, p.id));

      const [updated] = await tx.update(earnPositionsTable).set({
        status: isMatured ? "redeemed" : "early_redeemed",
        totalEarned: String(Math.max(0, earned - earlyPenalty)),
        closedAt: new Date(),
      }).where(eq(earnPositionsTable.id, id)).returning();

      // Ledger: earn_withdrawal (principal) + earn_interest (net interest, if > 0)
      const netInterest = Math.max(0, earned - earlyPenalty);
      await tx.insert(walletLedgerTable).values({
        userId, coinId: p.coinId, walletType: "spot", type: "earn_withdrawal",
        amount: String(principal), balanceBefore: spotWBefore, balanceAfter: String(Number(spotWBefore) + principal),
        refType: "earn_position", refId: String(id), note: `Earn redeem: ${p.name}`,
      });
      if (netInterest > 1e-10) {
        await tx.insert(walletLedgerTable).values({
          userId, coinId: p.coinId, walletType: "spot", type: "earn_interest",
          amount: String(netInterest), balanceBefore: String(Number(spotWBefore) + principal), balanceAfter: spotWAfter,
          refType: "earn_position", refId: String(id), note: `Earn interest: ${p.name}`,
        });
      }

      return { ...updated, payout, earned, earlyPenalty, _coinId: p.coinId, _netInterest: netInterest };
    });

    // 5-level earn referral commission (fire-and-forget, only on positive yield)
    // sourceRefId = "earn:{positionId}" — exactly-once per earn redemption.
    if (result._netInterest > 0) {
      creditTradingFeeReferralChain(userId, result._netInterest, result._coinId, "earn_plan", `earn:${id}`)
        .catch(() => null);
    }

    // Strip internal fields before sending response
    const { _coinId: _c, _netInterest: _n, ...publicResult } = result as any;
    res.json(publicResult);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── /earn/summary ────────────────────────────────────────────────────────────
// Per-user earn summary: pending yield (accrued, not redeemed), lifetime earned,
// total locked, breakdown by coin. Calculates live interest from startedAt so
// it reflects the latest position state even if the engine hasn't run yet.
router.get("/earn/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const now = Date.now();

  const rows = await db
    .select({
      posId: earnPositionsTable.id,
      amount: earnPositionsTable.amount,
      totalEarned: earnPositionsTable.totalEarned,
      status: earnPositionsTable.status,
      startedAt: earnPositionsTable.startedAt,
      maturedAt: earnPositionsTable.maturedAt,
      apy: earnProductsTable.apy,
      coinId: earnProductsTable.coinId,
      durationDays: earnProductsTable.durationDays,
      coinSymbol: coinsTable.symbol,
      coinName: coinsTable.name,
    })
    .from(earnPositionsTable)
    .innerJoin(earnProductsTable, eq(earnPositionsTable.productId, earnProductsTable.id))
    .innerJoin(coinsTable, eq(earnProductsTable.coinId, coinsTable.id))
    .where(eq(earnPositionsTable.userId, userId));

  const inrRate = getInrRate();

  type CoinSummary = {
    coinId: number; coinSymbol: string; coinName: string;
    locked: number; pendingYield: number; lifetimeEarned: number;
    lockedUsd: number; activeCount: number;
  };
  const byCoins = new Map<number, CoinSummary>();

  let totalLockedUsd = 0;
  let totalPendingYield = 0;
  let totalLifetimeEarned = 0;
  let activePositions = 0;

  for (const pos of rows) {
    const principal = Number(pos.amount);
    const apy = Number(pos.apy) / 100;
    const isActive = pos.status === "active";
    const elapsedDays = (now - pos.startedAt.getTime()) / 86400_000;
    // Live accrued interest (may be slightly ahead of DB totalEarned)
    const liveInterest = isActive ? principal * apy * elapsedDays / 365 : Number(pos.totalEarned);
    const lifetimeEarned = Number(pos.totalEarned);

    const tick = getRawTick(pos.coinSymbol);
    const priceUsdt = tick?.usdt ?? 0;

    if (isActive) {
      const lockedUsd = principal * priceUsdt;
      totalLockedUsd += lockedUsd;
      totalPendingYield += liveInterest;
      activePositions++;

      const entry = byCoins.get(pos.coinId) ?? {
        coinId: pos.coinId, coinSymbol: pos.coinSymbol, coinName: pos.coinName,
        locked: 0, pendingYield: 0, lifetimeEarned: 0, lockedUsd: 0, activeCount: 0,
      };
      entry.locked += principal;
      entry.pendingYield += liveInterest;
      entry.lockedUsd += lockedUsd;
      entry.activeCount++;
      byCoins.set(pos.coinId, entry);
    }
    totalLifetimeEarned += lifetimeEarned;
    const entry = byCoins.get(pos.coinId);
    if (entry) entry.lifetimeEarned += lifetimeEarned;
  }

  res.json({
    totalLockedUsd,
    totalLockedInr: totalLockedUsd * inrRate,
    totalPendingYield,
    totalLifetimeEarned,
    activePositions,
    byCoins: Array.from(byCoins.values()),
  });
});

export default router;

