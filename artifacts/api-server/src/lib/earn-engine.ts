/**
 * Earn Interest Engine — leader-gated, runs every 30 minutes.
 *
 * Responsibilities:
 *  1. Accrue simple interest: totalEarned = principal * (apy/100) * elapsedDays/365
 *     (recalculated from startedAt each run — idempotent, no lastAccruedAt needed)
 *  2. Mark matured positions (status → "matured") when maturedAt has passed
 *  3. Auto-renew: if autoMaturity=true and position matures, credit interest to
 *     spot wallet and create a new position with original principal re-staked
 */
import { db, earnPositionsTable, earnProductsTable, walletsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { isLeader } from "./leader";
import { logger } from "./logger";

const TICK_MS = 30 * 60 * 1000; // 30 minutes
let timer: NodeJS.Timeout | null = null;
let engineRunning = false;
let lastRunAt: Date | null = null;
let lastAccruedCount = 0;
let lastMaturedCount = 0;
let lastRenewedCount = 0;

export function getEarnEngineStatus() {
  return {
    running: engineRunning,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastAccruedCount,
    lastMaturedCount,
    lastRenewedCount,
    intervalMs: TICK_MS,
  };
}

async function runAccrual(): Promise<void> {
  if (!isLeader()) return;

  const rows = await db
    .select({
      posId: earnPositionsTable.id,
      userId: earnPositionsTable.userId,
      productId: earnPositionsTable.productId,
      amount: earnPositionsTable.amount,
      autoMaturity: earnPositionsTable.autoMaturity,
      status: earnPositionsTable.status,
      startedAt: earnPositionsTable.startedAt,
      maturedAt: earnPositionsTable.maturedAt,
      apy: earnProductsTable.apy,
      durationDays: earnProductsTable.durationDays,
      coinId: earnProductsTable.coinId,
      compounding: earnProductsTable.compounding,
      productStatus: earnProductsTable.status,
    })
    .from(earnPositionsTable)
    .innerJoin(earnProductsTable, eq(earnPositionsTable.productId, earnProductsTable.id))
    .where(eq(earnPositionsTable.status, "active"));

  let accrued = 0, matured = 0, renewed = 0;
  const now = Date.now();

  for (const pos of rows) {
    try {
      const principal = Number(pos.amount);
      const apy = Number(pos.apy) / 100;
      if (principal <= 0 || apy <= 0) continue;

      const elapsedDays = (now - pos.startedAt.getTime()) / 86400_000;
      const interest = principal * apy * elapsedDays / 365;

      // Step 1: Update totalEarned (idempotent — always recalculated from startedAt)
      await db.update(earnPositionsTable)
        .set({ totalEarned: String(Math.max(0, interest).toFixed(8)) })
        .where(eq(earnPositionsTable.id, pos.posId));
      accrued++;

      // Step 2: Check maturity for locked products
      const isMaturedNow = pos.maturedAt ? now >= pos.maturedAt.getTime() : false;
      if (!isMaturedNow || pos.durationDays <= 0) continue;

      if (pos.autoMaturity) {
        // Auto-renew: close position, credit interest, open new one
        await db.transaction(async (tx) => {
          const newMaturedAt = new Date(now + pos.durationDays * 86400_000);

          // Release locked earn balance
          await tx.update(walletsTable).set({
            locked: sql`GREATEST(0, ${walletsTable.locked} - ${principal})`,
            updatedAt: new Date(),
          }).where(and(
            eq(walletsTable.userId, pos.userId),
            eq(walletsTable.coinId, pos.coinId),
            eq(walletsTable.walletType, "earn"),
          ));

          // Credit accrued interest to spot (principal re-staked, interest paid out)
          const [spot] = await tx.select().from(walletsTable)
            .where(and(
              eq(walletsTable.userId, pos.userId),
              eq(walletsTable.coinId, pos.coinId),
              eq(walletsTable.walletType, "spot"),
            )).for("update").limit(1);
          if (spot) {
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${interest}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, spot.id));
          } else {
            await tx.insert(walletsTable).values({
              userId: pos.userId, coinId: pos.coinId, walletType: "spot",
              balance: String(interest.toFixed(8)), locked: "0",
            });
          }

          // Lock principal again in earn wallet for new position
          await tx.update(walletsTable).set({
            locked: sql`${walletsTable.locked} + ${principal}`,
            updatedAt: new Date(),
          }).where(and(
            eq(walletsTable.userId, pos.userId),
            eq(walletsTable.coinId, pos.coinId),
            eq(walletsTable.walletType, "earn"),
          ));

          // Mark old position as matured/closed
          await tx.update(earnPositionsTable).set({
            status: "matured",
            totalEarned: String(interest.toFixed(8)),
            closedAt: new Date(),
          }).where(eq(earnPositionsTable.id, pos.posId));

          // Open fresh position with same principal
          await tx.insert(earnPositionsTable).values({
            userId: pos.userId,
            productId: pos.productId,
            amount: String(principal.toFixed(8)),
            autoMaturity: true,
            status: "active",
            maturedAt: newMaturedAt,
          });
        });
        renewed++;
      } else {
        // Just mark as matured — user must manually redeem
        await db.update(earnPositionsTable)
          .set({ status: "matured" })
          .where(eq(earnPositionsTable.id, pos.posId));
        matured++;
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, posId: pos.posId }, "earn-engine: position accrual failed");
    }
  }

  lastAccruedCount = accrued;
  lastMaturedCount = matured;
  lastRenewedCount = renewed;

  if (accrued > 0 || matured > 0 || renewed > 0) {
    logger.info({ accrued, matured, renewed }, "earn-engine: tick complete");
  }
}

export async function runEarnEngineTick(): Promise<void> {
  if (engineRunning) return;
  engineRunning = true;
  try {
    await runAccrual();
    lastRunAt = new Date();
  } catch (e: any) {
    logger.warn({ err: e?.message }, "earn-engine: tick error");
  } finally {
    engineRunning = false;
  }
}

export function startEarnEngine(intervalMs: number = TICK_MS): void {
  if (timer) return;
  logger.info({ intervalMs }, "earn-engine: starting (leader-gated, 30min interval)");
  timer = setInterval(() => { void runEarnEngineTick(); }, intervalMs);
  setTimeout(() => { void runEarnEngineTick(); }, 15_000).unref();
  timer.unref();
}

export function stopEarnEngine(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
