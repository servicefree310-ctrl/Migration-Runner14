/**
 * referral-signup-bonus.ts
 *
 * Gated registration referral bonus — credits the referrer 1 USDT (admin-
 * configurable) only after the referred user satisfies BOTH conditions:
 *
 *   1. Basic KYC approved (kycLevel >= 1)
 *   2. First qualifying deposit: ≥ 10 USDT  OR  ≥ ₹1000 INR deposited
 *
 * Called fire-and-forget from:
 *   • /admin/kyc/:id   PATCH → status "approved"
 *   • /admin/inr-deposits/:id PATCH → status "completed"
 *   • /admin/crypto-deposits/:id PATCH → status "completed"
 *
 * Double-credit prevention: claims the pending referral row with a single
 * atomic UPDATE WHERE bonusCredited = false RETURNING.  If another concurrent
 * call already claimed it, the UPDATE returns nothing and we exit.
 */

import { and, eq, sql, sum } from "drizzle-orm";
import {
  db,
  coinsTable,
  referralsTable,
  usersTable,
  walletLedgerTable,
  walletsTable,
} from "@workspace/db";
import { logger } from "./logger";
import { loadReferralConfig } from "../routes/admin-referrals";

/** Minimum cumulative USDT deposit to unlock the referral signup bonus. */
const USDT_THRESHOLD = 10;
/** Minimum cumulative INR deposit to unlock the referral signup bonus. */
const INR_THRESHOLD = 1000;

export async function checkAndCreditRegistrationBonus(
  referredUserId: number,
): Promise<void> {
  try {
    const cfg = await loadReferralConfig();
    if (!cfg.enabled) return;
    const BONUS = cfg.registrationBonus; // default 1 USDT

    // ── 1. Load referred user ──────────────────────────────────────────────
    const [user] = await db
      .select({ referredBy: usersTable.referredBy, kycLevel: usersTable.kycLevel })
      .from(usersTable)
      .where(eq(usersTable.id, referredUserId))
      .limit(1);

    if (!user?.referredBy) return; // not a referred user
    if ((user.kycLevel ?? 0) < 1) return; // KYC Level 1 not yet approved

    // ── 2. Resolve USDT coin ID ────────────────────────────────────────────
    const [usdtCoin] = await db
      .select({ id: coinsTable.id })
      .from(coinsTable)
      .where(eq(coinsTable.symbol, "USDT"))
      .limit(1);
    if (!usdtCoin) return; // USDT not configured

    // ── 3. Check deposit threshold (cumulative) ────────────────────────────
    const [usdtRow] = await db
      .select({ total: sum(walletLedgerTable.amount) })
      .from(walletLedgerTable)
      .where(
        and(
          eq(walletLedgerTable.userId, referredUserId),
          eq(walletLedgerTable.coinId, usdtCoin.id),
          eq(walletLedgerTable.type, "deposit_crypto"),
        ),
      );
    const usdtDeposited = parseFloat(usdtRow?.total ?? "0");

    if (usdtDeposited < USDT_THRESHOLD) {
      // USDT threshold not met — check INR
      const [inrRow] = await db
        .select({ total: sum(walletLedgerTable.amount) })
        .from(walletLedgerTable)
        .where(
          and(
            eq(walletLedgerTable.userId, referredUserId),
            eq(walletLedgerTable.type, "deposit_inr"),
          ),
        );
      const inrDeposited = parseFloat(inrRow?.total ?? "0");
      if (inrDeposited < INR_THRESHOLD) return; // neither threshold met
    }

    // ── 4. Claim the pending referral row atomically ───────────────────────
    // UPDATE returns nothing if bonusCredited is already true (another caller
    // got here first) — prevents any double-credit.
    const [claimed] = await db
      .update(referralsTable)
      .set({ bonusCredited: true, bonusAmount: String(BONUS) })
      .where(
        and(
          eq(referralsTable.referredId, referredUserId),
          eq(referralsTable.sourceType, "registration"),
          eq(referralsTable.bonusCredited, false),
        ),
      )
      .returning({ id: referralsTable.id });

    if (!claimed) return; // already credited by a concurrent trigger

    // ── 5. Credit referrer's USDT spot wallet (atomic upsert) ─────────────
    const referrerId = user.referredBy;
    const [updated] = await db
      .insert(walletsTable)
      .values({
        userId: referrerId,
        coinId: usdtCoin.id,
        walletType: "spot",
        balance: String(BONUS),
        locked: "0",
      })
      .onConflictDoUpdate({
        target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
        set: {
          balance: sql`${walletsTable.balance} + ${BONUS}`,
          updatedAt: new Date(),
        },
      })
      .returning({ balance: walletsTable.balance });

    // ── 6. Wallet ledger entry ─────────────────────────────────────────────
    if (updated) {
      const balanceAfter  = updated.balance;
      const balanceBefore = String(Math.max(0, parseFloat(balanceAfter) - BONUS));
      await db.insert(walletLedgerTable).values({
        userId:        referrerId,
        coinId:        usdtCoin.id,
        walletType:    "spot",
        type:          "referral_bonus",
        amount:        String(BONUS),
        balanceBefore,
        balanceAfter,
        refType:       "referral",
        refId:         String(referredUserId),
        note:          "Registration referral bonus (KYC L1 + deposit verified)",
      }).catch(() => null);
    }

    logger.info(
      { referrerId, referredId: referredUserId, bonus: BONUS },
      "referral: signup bonus credited after KYC + deposit verification",
    );
  } catch (err) {
    logger.warn({ err, referredUserId }, "referral: signup bonus check failed (non-critical)");
  }
}
