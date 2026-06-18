/**
 * auto-withdraw-scheduler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-broadcasts pending crypto withdrawals for networks that have
 * autoWithdrawEnabled = true (EVM chains only — BSC USDT etc.).
 *
 * Flow:
 *   1. Every `intervalMs` the leader polls for pending withdrawals on
 *      auto-withdraw-enabled EVM networks.
 *   2. For each pending withdrawal, calls broadcastWithdrawal() which
 *      atomically claims it, signs the on-chain tx, and saves the txHash.
 *   3. withdrawal-watcher.ts then polls the txHash until N confirmations
 *      and marks status = 'completed'.
 *
 * Safety:
 *   - Only the elected leader runs this (like deposit-sweeper & withdrawal-watcher).
 *   - broadcastWithdrawal() itself is idempotent: it uses FOR UPDATE + status
 *     check so double-processing is impossible even if two instances race.
 *   - Withdrawals that fail broadcast revert to 'pending' so they retry on next tick.
 */

import { db, networksTable, cryptoWithdrawalsTable, usersTable, coinsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { broadcastWithdrawal, isEvmChain, BroadcastError } from "./auto-broadcaster";
import { logger } from "./logger";
import { sendWithdrawalInitiatedEmail } from "./email";

const SYSTEM_USER_ID = 0;
const DEFAULT_INTERVAL_MS = 60_000;
const MAX_PER_TICK = 10;

type SchedulerState = {
  running: boolean;
  intervalMs: number;
  lastTickAt: Date | null;
  lastResult: { checked: number; sent: number; failed: number };
};

const state: SchedulerState = {
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastTickAt: null,
  lastResult: { checked: 0, sent: 0, failed: 0 },
};

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const { isLeader } = await import("./leader");
  if (!isLeader()) return;

  let checked = 0, sent = 0, failed = 0;

  try {
    // 1. Find EVM networks with auto-withdraw enabled and a configured hot wallet
    const networks = await db
      .select()
      .from(networksTable)
      .where(
        and(
          eq(networksTable.status, "active"),
          eq(networksTable.autoWithdrawEnabled, true),
          eq(networksTable.withdrawEnabled, true),
        ),
      );

    const eligibleNetIds = networks
      .filter((n) => isEvmChain(n.chain) && n.hotWalletAddress && n.hotWalletPrivateKeyEnc && n.nodeAddress)
      .map((n) => n.id);

    if (eligibleNetIds.length === 0) return;

    // 2. Fetch pending withdrawals for these networks (cap per tick to avoid overload)
    const pending = await db
      .select()
      .from(cryptoWithdrawalsTable)
      .where(
        and(
          eq(cryptoWithdrawalsTable.status, "pending"),
          inArray(cryptoWithdrawalsTable.networkId, eligibleNetIds),
        ),
      )
      .limit(MAX_PER_TICK);

    checked = pending.length;
    if (checked === 0) return;

    logger.info({ count: checked, networkIds: eligibleNetIds }, "auto-withdraw: processing pending withdrawals");

    // 3. Broadcast each one sequentially (avoids nonce collisions on same hot wallet)
    for (const wd of pending) {
      try {
        const result = await broadcastWithdrawal(wd.id, SYSTEM_USER_ID);
        logger.info({ withdrawalId: wd.id, txHash: result.txHash, amount: wd.amount }, "auto-withdraw: broadcasted");
        sent++;
        // Fire-and-forget withdrawal notification email
        void (async () => {
          try {
            const [user] = await db.select({ email: usersTable.email })
              .from(usersTable).where(eq(usersTable.id, wd.userId)).limit(1);
            const net = networks.find((n) => n.id === wd.networkId);
            const [coin] = await db.select({ symbol: coinsTable.symbol })
              .from(coinsTable).where(eq(coinsTable.id, wd.coinId)).limit(1);
            if (user?.email && coin) {
              await sendWithdrawalInitiatedEmail(user.email, {
                amount: wd.amount,
                currency: coin.symbol,
                address: wd.toAddress ?? undefined,
                method: net?.name ?? net?.chain ?? "Crypto",
                txId: result.txHash,
              });
            }
          } catch { /* email failure must never block scheduler */ }
        })();
      } catch (e) {
        failed++;
        if (e instanceof BroadcastError && e.code === 409) {
          // Already claimed by another process — not a real error
          logger.debug({ withdrawalId: wd.id }, "auto-withdraw: already claimed, skipping");
        } else {
          logger.error({ withdrawalId: wd.id, err: (e as Error).message }, "auto-withdraw: broadcast failed");
        }
      }
    }
  } catch (e: any) {
    logger.error({ err: e?.message }, "auto-withdraw scheduler tick failed");
  } finally {
    state.lastTickAt = new Date();
    state.lastResult = { checked, sent, failed };
    if (sent > 0 || failed > 0) {
      logger.info({ checked, sent, failed }, "auto-withdraw: tick complete");
    }
  }
}

export function startAutoWithdrawScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  state.running = true;
  state.intervalMs = intervalMs;
  timer = setInterval(() => { void tick(); }, intervalMs);
  setTimeout(() => { void tick(); }, 10_000);
  logger.info({ intervalMs }, "auto-withdraw scheduler started");
}

export function stopAutoWithdrawScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
  state.running = false;
}

export function getAutoWithdrawSchedulerStatus(): typeof state {
  return { ...state };
}
