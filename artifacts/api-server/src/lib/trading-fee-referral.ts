/**
 * trading-fee-referral.ts
 * Distributes a portion of each spot/futures/earn fee to up to 5 levels
 * of the referral chain. Called fire-and-forget after every matched trade.
 *
 * Commission rates are admin-configurable via PUT /api/admin/referral-settings.
 * Defaults (% of fee):
 *   Trading/Futures — L1:30  L2:15  L3:8  L4:4  L5:2
 *   Earn            — L1:3   L2:2   L3:1  L4:0.5 L5:0.25
 *   AI              — L1:5   L2:3   L3:2  L4:1   L5:0.5
 *
 * Idempotency: when `sourceRefId` is provided (e.g. "spot:123", "fut:456",
 * "ai_earn:789", "earn:321") we check for an existing row with the same
 * (referrerId, sourceRefId, level) before inserting — so calling this twice
 * for the same event is a no-op. Always pass sourceRefId in new call sites.
 */

import {
  db, usersTable, walletsTable, walletLedgerTable, referralsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { loadReferralConfig } from "../routes/admin-referrals";

/**
 * Generic 5-level referral chain creditor.
 * Walks up the referral chain from `originUserId` and credits each ancestor.
 *
 * @param sourceRefId  Optional unique key for the originating event.
 *   Format: "spot:{orderId}" | "fut:{orderId}" | "ai_earn:{earningId}" | "earn:{positionId}"
 *   When provided, each (referrerId, sourceRefId, level) is only ever
 *   credited once — repeat calls with the same ref are silently skipped.
 */
export async function creditReferralChain(
  originUserId: number,
  amount: number,
  coinId: number,
  sourceType: string,
  levelRates: Record<string, number>,
  sourceRefId?: string,
): Promise<void> {
  if (!amount || amount <= 0) return;
  let currentId = originUserId;

  for (let level = 1; level <= 5; level++) {
    const [user] = await db
      .select({ id: usersTable.id, referredBy: usersTable.referredBy })
      .from(usersTable)
      .where(eq(usersTable.id, currentId))
      .limit(1);

    if (!user?.referredBy) break;

    const pct = Number(levelRates[String(level)] ?? levelRates[level] ?? 0);
    const commission = parseFloat((amount * pct / 100).toFixed(8));
    if (commission < 0.000001) { currentId = user.referredBy; continue; }

    // ── Idempotency guard ─────────────────────────────────────────────────
    // If a sourceRefId is provided, skip if this exact event has already
    // been credited at this level for this referrer.
    if (sourceRefId) {
      const [existing] = await db
        .select({ id: referralsTable.id })
        .from(referralsTable)
        .where(and(
          eq(referralsTable.referrerId, user.referredBy),
          eq(referralsTable.sourceRefId, sourceRefId),
          eq(referralsTable.level, level),
        ))
        .limit(1);
      if (existing) {
        currentId = user.referredBy;
        continue;
      }
    }

    // Atomic upsert: create the wallet if absent, otherwise increment balance.
    const [updated] = await db.insert(walletsTable)
      .values({
        userId: user.referredBy,
        coinId,
        walletType: "spot",
        balance: String(commission),
        locked: "0",
      })
      .onConflictDoUpdate({
        target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
        set: {
          balance: sql`${walletsTable.balance} + ${commission}`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: walletsTable.id, balance: walletsTable.balance });

    if (updated) {
      const balanceAfter  = updated.balance;
      const balanceBefore = String(Math.max(0, parseFloat(balanceAfter) - commission));

      await db.insert(walletLedgerTable).values({
        userId:        user.referredBy,
        coinId,
        walletType:    "spot",
        type:          "referral_bonus",
        amount:        String(commission),
        balanceBefore,
        balanceAfter,
        refType:       "referral",
        refId:         sourceRefId ?? String(originUserId),
        note:          `L${level} referral commission (${sourceType})`,
      }).catch(() => null);
    }

    await db.insert(referralsTable).values({
      referrerId:     user.referredBy,
      referredId:     originUserId,
      bonusCredited:  true,
      bonusAmount:    String(commission),
      commissionRate: String(pct),
      level,
      sourceType,
      sourceRefId:    sourceRefId ?? null,
    }).catch(() => null);

    logger.debug(
      { referrerId: user.referredBy, level, commission, pct, originUserId, sourceType, sourceRefId },
      "referral-chain: commission credited",
    );

    currentId = user.referredBy;
  }
}

/**
 * Walk up to 5 levels of the referral chain and credit each referrer.
 *
 * @param traderId    — The user who generated the fee
 * @param feeAmount   — Total fee/profit in quote currency
 * @param quoteCoinId — Coin ID to credit (e.g. USDT)
 * @param sourceType  — "trading_fee" | "futures_fee" | "earn_plan"
 * @param sourceRefId — Unique event key for idempotency (e.g. "spot:123")
 */
export async function creditTradingFeeReferralChain(
  traderId: number,
  feeAmount: number,
  quoteCoinId: number,
  sourceType: "trading_fee" | "futures_fee" | "earn_plan" = "trading_fee",
  sourceRefId?: string,
): Promise<void> {
  const config = await loadReferralConfig();
  if (!config.enabled) return;

  const rates = sourceType === "earn_plan" ? config.earn : config.trading;
  return creditReferralChain(traderId, feeAmount, quoteCoinId, sourceType, rates, sourceRefId);
}
