/**
 * ai-credit-engine.ts  v2
 *
 * Professional AI trading simulation with realistic win/loss distribution.
 *
 * Rules:
 *  - Effective daily return = min(plan.dailyReturnPercent, MAX_DAILY_PCT) → hard cap 1.3 %
 *  - Actual daily varies in [dayFloor × effectiveDailyPct, effectiveDailyPct]
 *  - Risk-based loss entry frequency:
 *      low    → ~2  loss ticks / day, small debits
 *      medium → ~4  loss ticks / day, moderate debits
 *      high   → ~7  loss ticks / day, significant debits (wins compensate)
 *  - Win multipliers are sized so EXPECTED net/day ≈ effectiveDailyPct
 *  - Daily cap enforced via DB sum → wins stop once daily budget is consumed
 *  - Each entry carries a trade-style note visible in the earnings log
 *  - Deterministic per (userId, subId, tickKey) — safe to restart
 */

import {
  db,
  aiTradingPlansTable,
  aiTradingSubscriptionsTable,
  aiTradingEarningsTable,
  walletsTable,
  walletLedgerTable,
  coinsTable,
} from "@workspace/db";
import { eq, and, gte, sum, sql } from "drizzle-orm";
import { logger } from "./logger";
import { isLeader } from "./leader";
import { creditReferralChain } from "./trading-fee-referral";
import { loadReferralConfig } from "../routes/admin-referrals";

// ─── Constants ────────────────────────────────────────────────────────────────
/** Absolute daily return cap — no plan ever earns more than this per day */
const MAX_DAILY_PCT = 1.3;

/** How often the engine wakes up to check which subs are due */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // every 5 minutes

/** Target credit interval per subscription — one credit per hour */
const CREDIT_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Spread credits across the full hour so they don't all fire at once.
 * Each subscription gets a deterministic minute-offset in [0, 55] based on
 * its id (12 buckets × 5 min = 60 min coverage).
 * Example: sub id=1 → 0 min offset, id=5 → 20 min, id=12 → 55 min.
 */
function subCreditOffsetMs(subId: number): number {
  return (subId % 12) * 5 * 60_000; // 0 – 55 min in 5-min steps
}

// ─── Risk profiles ────────────────────────────────────────────────────────────
interface RiskProfile {
  /** Fraction of ticks that are losses (0–1); engine runs ~24 ticks/day */
  lossTickRate: number;
  /** Loss multiplier range [min, max] — both values are negative */
  lossRange:    [number, number];
  /** Win multiplier range [min, max] — both values are positive */
  winRange:     [number, number];
  /** Minimum daily target as fraction of effectiveDailyPct */
  dayFloor:     number;
}

/**
 * Win ranges are set so expected(net per tick) ≈ baseTick × 1.0
 *
 * high example:  0.71 × 1.90 − 0.29 × 0.775 ≈ 1.12 × base
 * The excess is clipped by the daily cap, keeping net ≤ effectiveDailyPct.
 */
const RISK_PROFILES: Record<string, RiskProfile> = {
  low: {
    lossTickRate: 0.08,           // ≈ 2 losses / day
    lossRange:    [-0.15, -0.40], // small debits: 15–40 % of base tick
    winRange:     [1.00,   1.25], // steady, predictable wins
    dayFloor:     0.90,           // day always ≥ 90 % of target
  },
  medium: {
    lossTickRate: 0.17,           // ≈ 4 losses / day
    lossRange:    [-0.30, -0.65], // moderate debits
    winRange:     [1.20,   1.70], // higher wins to offset losses
    dayFloor:     0.83,
  },
  high: {
    lossTickRate: 0.29,           // ≈ 7 losses / day
    lossRange:    [-0.45, -1.10], // significant debits
    winRange:     [1.60,   2.20], // large wins; daily cap keeps net ≤ 1.3 %
    dayFloor:     0.75,
  },
  ultra: {
    lossTickRate: 0.38,           // ≈ 9 losses / day — very choppy
    lossRange:    [-0.60, -1.50], // large stop-outs
    winRange:     [2.00,   3.00], // outsized wins; daily cap still ≤ 1.3 %
    dayFloor:     0.65,           // day can dip to 65 % of target
  },
};

// ─── Deterministic hash ───────────────────────────────────────────────────────
/** Returns a float in [0, 1) — deterministic for given integer seeds */
function phash(a: number, b: number, c: number): number {
  let x = ((a * 31337 + b * 7919 + c * 1009) & 0x7fffffff) >>> 0;
  x ^= x << 13;
  x ^= x >>> 7;
  x ^= x << 17;
  return (x >>> 0) / 0x100000000;
}

// ─── Trade note pools ─────────────────────────────────────────────────────────
const WIN_NOTES = [
  "BTC/USDT Long — MA crossover breakout",
  "ETH/USDT Short — RSI reversal captured",
  "SOL/USDT Long — momentum continuation",
  "BNB/USDT Long — range breakout scalp",
  "BTC/USDT Short — bear flag target hit",
  "XRP/USDT Long — support bounce entry",
  "ETH/USDT Long — VWAP reclaim",
  "BTC/USDT Long — volume spike signal",
  "SOL/USDT Short — resistance rejection",
  "DOGE/USDT Long — trend follow entry",
  "ADA/USDT Long — accumulation zone buy",
  "MATIC/USDT Short — trend reversal play",
];

const LOSS_NOTES = [
  "BTC/USDT Long — stop-loss triggered",
  "ETH/USDT Long — support break, SL hit",
  "SOL/USDT Short — spike stopped out",
  "BNB/USDT Long — SL hit at structure",
  "BTC/USDT Short — reversal stopped out",
  "XRP/USDT Long — failed breakout, SL",
  "ETH/USDT Short — news spike stopped out",
  "BTC/USDT Long — false breakout, SL hit",
];

function pickNote(isLoss: boolean, subId: number, tickKey: number): string {
  const pool = isLoss ? LOSS_NOTES : WIN_NOTES;
  const idx  = Math.floor(phash(subId, tickKey, 42) * pool.length);
  return pool[Math.min(idx, pool.length - 1)];
}

// ─── Wallet helpers ───────────────────────────────────────────────────────────
async function getUsdtCoinId(): Promise<number | null> {
  const [c] = await db
    .select({ id: coinsTable.id })
    .from(coinsTable)
    .where(eq(coinsTable.symbol, "USDT"))
    .limit(1);
  return c?.id ?? null;
}

async function getSpotWallet(userId: number, coinId: number) {
  const [w] = await db
    .select()
    .from(walletsTable)
    .where(
      and(
        eq(walletsTable.userId, userId),
        eq(walletsTable.walletType, "spot"),
        eq(walletsTable.coinId, coinId),
      ),
    )
    .limit(1);
  return w ?? null;
}

// ─── Referral ─────────────────────────────────────────────────────────────────
async function creditAIReferralChain(userId: number, amount: number, sourceRefId?: string): Promise<void> {
  const usdtCoinId = await getUsdtCoinId();
  if (!usdtCoinId) return;
  const cfg = await loadReferralConfig();
  if (!cfg.enabled) return;
  await creditReferralChain(userId, amount, usdtCoinId, "ai_trading", cfg.ai, sourceRefId);
}

// ─── Daily earned (positive credits only, since midnight UTC) ─────────────────
async function getTodayPositiveEarned(subId: number, dayKey: number): Promise<number> {
  const dayStart = new Date(dayKey * 86_400_000); // UTC midnight
  const [row] = await db
    .select({ total: sum(aiTradingEarningsTable.amountUsdt) })
    .from(aiTradingEarningsTable)
    .where(
      and(
        eq(aiTradingEarningsTable.subscriptionId, subId),
        gte(aiTradingEarningsTable.creditedAt, dayStart),
      ),
    );
  // Only count positive credits toward the daily cap
  return Math.max(0, parseFloat(row?.total ?? "0"));
}

// ─── Main tick ────────────────────────────────────────────────────────────────
async function creditTick(): Promise<void> {
  if (!isLeader()) return;

  const now = new Date();
  // Unique integer per HOUR — deterministic seed (independent of check interval)
  const tickKey = Math.floor(now.getTime() / CREDIT_INTERVAL_MS);
  const dayKey  = Math.floor(now.getTime() / 86_400_000);

  const usdtCoinId = await getUsdtCoinId();
  if (!usdtCoinId) {
    logger.warn("ai-credit: USDT coin not found, skipping tick");
    return;
  }

  const activeSubs = await db
    .select()
    .from(aiTradingSubscriptionsTable)
    .where(eq(aiTradingSubscriptionsTable.status, "active"));

  for (const sub of activeSubs) {
    try {
      const [plan] = await db
        .select()
        .from(aiTradingPlansTable)
        .where(eq(aiTradingPlansTable.id, sub.planId));
      if (!plan) continue;

      const invested     = parseFloat(sub.investedAmount);
      const planDailyPct = parseFloat(plan.dailyReturnPercent);

      // ── Hard cap: never above MAX_DAILY_PCT regardless of plan setting ──
      const effectiveDailyPct = Math.min(planDailyPct, MAX_DAILY_PCT);

      // ── Staggered due-time: spread credits evenly across the hour ────────
      // First credit = startedAt + subOffset (so bots started together still
      // diverge). Subsequent credits = lastCreditedAt + 60 min.
      // This ensures 24 bots never all credit at the same moment.
      const lastCreditedAt = sub.lastCreditedAt;
      const offsetMs = subCreditOffsetMs(sub.id);
      const nextDueMs = lastCreditedAt
        ? new Date(lastCreditedAt).getTime() + CREDIT_INTERVAL_MS
        : new Date(sub.startedAt).getTime() + offsetMs;
      if (now.getTime() < nextDueMs) continue;

      // Compute elapsed for baseTick (how many hours since last credit)
      const lastCredited = lastCreditedAt ?? sub.startedAt;
      const elapsedMs    = now.getTime() - new Date(lastCredited).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);

      // ── Risk profile ─────────────────────────────────────────────────────
      const riskKey = (plan.riskLevel ?? "medium").toLowerCase();
      const profile  = RISK_PROFILES[riskKey] ?? RISK_PROFILES["medium"]!;

      // ── Day-level multiplier: [dayFloor, 1.0] × effectiveDailyPct ───────
      // Seeded per (user, sub, day) → same day always targets same amount
      const daySeed = phash(sub.userId, sub.id, dayKey);
      const dayMul  = profile.dayFloor + daySeed * (1.0 - profile.dayFloor);

      // ── Base credit for this elapsed period ──────────────────────────────
      // = proportional share of today's target for elapsedHours
      const baseTick = invested * (effectiveDailyPct / 100 / 24) * elapsedHours * dayMul;

      // ── Win or loss decision — deterministic per tick ────────────────────
      const lossSeed = phash(sub.userId, sub.id, tickKey * 3);
      const isLoss   = lossSeed < profile.lossTickRate;

      // ── Tick multiplier ───────────────────────────────────────────────────
      const sizeSeed = phash(sub.userId, sub.id, tickKey * 7 + 1);
      let multiplier: number;
      if (isLoss) {
        const [lo, hi] = profile.lossRange;
        multiplier = lo + sizeSeed * (hi - lo); // negative
      } else {
        const [lo, hi] = profile.winRange;
        multiplier = lo + sizeSeed * (hi - lo); // positive
      }

      let credit = parseFloat((baseTick * multiplier).toFixed(8));

      // ── Daily cap: wins stop once daily budget is consumed ───────────────
      if (credit > 0) {
        const todayEarned = await getTodayPositiveEarned(sub.id, dayKey);
        const maxDay      = invested * effectiveDailyPct / 100;
        const remaining   = maxDay - todayEarned;
        if (remaining <= 1e-8) continue; // daily budget fully consumed
        credit = Math.min(credit, remaining);
      }

      // ── Floor: loss cannot wipe out more than 20 % of lifetime earned ───
      const totalEarned = parseFloat(sub.totalEarned ?? "0");
      if (credit < 0) {
        credit = Math.max(credit, -(totalEarned * 0.20));
      }

      if (Math.abs(credit) < 0.000001) continue;

      // ── Apply to wallet ───────────────────────────────────────────────────
      // Re-read the wallet to get current balance for the ledger snapshot.
      // The actual UPDATE uses a SQL expression so it is atomic even if two
      // workers run concurrently (leader election reduces that to near-zero,
      // but correctness must not rely on it).
      const wallet   = await getSpotWallet(sub.userId, usdtCoinId);
      const prevFree = parseFloat(wallet?.balance ?? "0");
      const newFree  = Math.max(0, prevFree + credit); // used only for ledger

      if (wallet && wallet.id) {
        await db
          .update(walletsTable)
          .set({
            // GREATEST(0,...) mirrors the JS Math.max(0,...) floor while
            // keeping the operation atomic — no separate read-write needed.
            balance:    credit >= 0
              ? sql`${walletsTable.balance} + ${credit}`
              : sql`GREATEST(0, ${walletsTable.balance} + ${credit})`,
            updatedAt: new Date(),
          })
          .where(eq(walletsTable.id, wallet.id));
      }

      // ── Earnings record (note embedded in planName for UI display) ───────
      const note = pickNote(isLoss, sub.id, tickKey);
      const [earningRow] = await db.insert(aiTradingEarningsTable).values({
        userId:         sub.userId,
        subscriptionId: sub.id,
        planName:       `${plan.name} — ${note}`,
        amountUsdt:     String(credit),
        creditedAt:     now,
      }).returning({ id: aiTradingEarningsTable.id });

      // ── Wallet ledger ─────────────────────────────────────────────────────
      await db
        .insert(walletLedgerTable)
        .values({
          userId:        sub.userId,
          coinId:        usdtCoinId,
          walletType:    "spot",
          type:          "ai_earning",
          amount:        String(credit),
          balanceBefore: String(prevFree),
          balanceAfter:  String(newFree),
          refType:       "ai_trading_subscription",
          refId:         String(sub.id),
          note,
          createdAt:     now,
        })
        .catch(err =>
          logger.warn({ err: (err as Error)?.message }, "ai-credit: ledger write failed"),
        );

      // ── Referral commission only on profitable ticks ─────────────────────
      // sourceRefId = "ai_earn:{earningRowId}" — exactly-once per AI earning event.
      if (credit > 0) {
        const aiRefId = earningRow ? `ai_earn:${earningRow.id}` : undefined;
        await creditAIReferralChain(sub.userId, credit, aiRefId).catch(err =>
          logger.warn({ err: (err as Error)?.message, subId: sub.id }, "ai-credit: referral error"),
        );
      }

      // ── Update subscription totals ────────────────────────────────────────
      const newTotal  = parseFloat((totalEarned + credit).toFixed(8));
      const isExpired = sub.expiresAt != null && now >= new Date(sub.expiresAt);

      await db
        .update(aiTradingSubscriptionsTable)
        .set({
          totalEarned:    String(newTotal),
          lastCreditedAt: now,
          ...(isExpired ? { status: "completed" } : {}),
        })
        .where(eq(aiTradingSubscriptionsTable.id, sub.id));

      // ── Return principal on plan expiry ───────────────────────────────────
      if (isExpired) {
        // Respect the original funding coin — INR-funded subs get INR back.
        // Legacy subs with no fundingCoinId recorded fall back to USDT.
        const refundCoinId  = sub.fundingCoinId ?? usdtCoinId;
        const refundAmount  = parseFloat(String(sub.fundingAmount ?? sub.investedAmount));
        const w2 = await getSpotWallet(sub.userId, refundCoinId);
        if (w2 && w2.id) {
          const prevBal = parseFloat(w2.balance ?? "0");
          // Use SQL expressions to avoid a read-then-write race condition.
          // Two concurrent expiry ticks (e.g. leader failover) must not
          // double-credit the principal. GREATEST(0,...) on locked ensures
          // we never push it below zero.
          await db
            .update(walletsTable)
            .set({
              balance:   sql`${walletsTable.balance} + ${refundAmount}`,
              locked:    sql`GREATEST(0, ${walletsTable.locked} - ${refundAmount})`,
              updatedAt: new Date(),
            })
            .where(eq(walletsTable.id, w2.id));
          // Ledger entry so the principal return is visible to the user.
          await db.insert(walletLedgerTable).values({
            userId:        sub.userId,
            coinId:        refundCoinId,
            walletType:    "spot",
            type:          "ai_principal_return",
            amount:        String(refundAmount),
            balanceBefore: String(prevBal),
            balanceAfter:  String(prevBal + refundAmount),
            refType:       "ai_trading_subscription",
            refId:         String(sub.id),
            note:          "AI plan completed — principal returned",
            createdAt:     now,
          }).catch(err =>
            logger.warn({ err: (err as Error)?.message }, "ai-credit: principal ledger write failed"),
          );
        }
        logger.info(
          { subId: sub.id, userId: sub.userId, refundCoinId, refundAmount },
          "ai-credit: subscription completed, principal returned",
        );
      }

      const sign = credit >= 0 ? "+" : "";
      logger.info(
        {
          subId:     sub.id,
          userId:    sub.userId,
          credit:    `${sign}${credit.toFixed(6)} USDT`,
          risk:      riskKey,
          isLoss,
          effectiveCap: `${effectiveDailyPct}% (plan ${planDailyPct}%)`,
          note,
        },
        isLoss ? "ai-credit: loss entry" : "ai-credit: profit entry",
      );
    } catch (err: unknown) {
      logger.warn(
        { subId: sub.id, err: (err as Error)?.message },
        "ai-credit: tick error on subscription",
      );
    }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export function startAICreditEngine(): void {
  // Small delay on first start to let DB connections settle
  setTimeout(
    () =>
      creditTick().catch(err =>
        logger.warn({ err: (err as Error)?.message }, "ai-credit: initial tick failed"),
      ),
    10_000,
  );

  setInterval(
    () =>
      creditTick().catch(err =>
        logger.warn({ err: (err as Error)?.message }, "ai-credit: tick failed"),
      ),
    CHECK_INTERVAL_MS,
  );

  logger.info(
    "ai-credit-engine: v2 started — hourly ticks, max 1.3 %/day cap, risk-based losses, deterministic",
  );
}
