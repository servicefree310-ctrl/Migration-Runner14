import { ethers } from "ethers";
import { db, cryptoWithdrawalsTable, networksTable, walletsTable, walletLedgerTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { decryptSecret } from "./crypto-vault";
import { isEvmChain } from "./auto-broadcaster";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_CONFIRMATIONS = 15;
let timer: NodeJS.Timeout | null = null;
let running = false;
let lastRunAt: Date | null = null;
let lastResult: { checked: number; confirmed: number; errors: number } = { checked: 0, confirmed: 0, errors: 0 };

function buildProvider(rpcUrl: string, apiKey: string | null): ethers.JsonRpcProvider {
  let url = rpcUrl;
  if (apiKey && !url.includes(apiKey)) {
    url = url.endsWith("/") ? `${url}${apiKey}` : `${url}/${apiKey}`;
  }
  return new ethers.JsonRpcProvider(url);
}

export async function scanBroadcasting(): Promise<{ checked: number; confirmed: number; errors: number }> {
  const rows = await db.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.status, "broadcasting"));
  let checked = 0, confirmed = 0, errors = 0;
  if (rows.length === 0) return { checked, confirmed, errors };

  const netIds = Array.from(new Set(rows.map((r) => r.networkId)));
  const nets = await db.select().from(networksTable).where(inArray(networksTable.id, netIds));
  const netMap = new Map(nets.map((n) => [n.id, n] as const));

  for (const w of rows) {
    if (!w.txHash) continue;
    const net = netMap.get(w.networkId);
    if (!net || !isEvmChain(net.chain) || !net.nodeAddress) continue;
    checked++;
    try {
      const apiKey = net.rpcApiKey ? decryptSecret(net.rpcApiKey) : null;
      const provider = buildProvider(net.nodeAddress, apiKey);
      const receipt = await provider.getTransactionReceipt(w.txHash);
      if (!receipt) {
        // Still pending in mempool
        continue;
      }
      if (receipt.status === 0) {
        // Tx reverted on-chain — auto-refund user balance atomically.
        await db.transaction(async (tx) => {
          await tx.update(cryptoWithdrawalsTable).set({
            status: "rejected",
            rejectReason: `On-chain tx reverted (status=0, txHash=${w.txHash}). Balance auto-refunded.`,
            processedAt: new Date(),
          }).where(eq(cryptoWithdrawalsTable.id, w.id));

          // Return funds to available balance and reduce locked informational counter.
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${w.amount}`,
            locked:  sql`GREATEST(0, ${walletsTable.locked} - ${w.amount})`,
          }).where(
            and(
              eq(walletsTable.userId, w.userId),
              eq(walletsTable.coinId, w.coinId),
              eq(walletsTable.walletType, "spot"),
            ),
          );

          // Ledger entry for the auto-refund.
          await tx.insert(walletLedgerTable).values({
            userId:     w.userId,
            coinId:     w.coinId,
            walletType: "spot",
            type:       "admin_credit",
            amount:     w.amount,
            refType:    "crypto_withdrawal",
            refId:      String(w.id),
            note:       `Auto-refund: on-chain tx reverted (${w.txHash})`,
          });
        });
        logger.error({ withdrawalId: w.id, txHash: w.txHash, userId: w.userId }, "Withdrawal tx reverted — balance auto-refunded");
        continue;
      }
      const head = await provider.getBlockNumber();
      const confs = Math.max(0, head - receipt.blockNumber + 1);
      const required = net.confirmations || DEFAULT_CONFIRMATIONS;
      if (confs >= required) {
        await db.update(cryptoWithdrawalsTable).set({
          status: "completed",
          confirmations: confs,
          processedAt: new Date(),
        }).where(and(eq(cryptoWithdrawalsTable.id, w.id), eq(cryptoWithdrawalsTable.status, "broadcasting")));
        confirmed++;
        logger.info({ withdrawalId: w.id, confs, required }, "Withdrawal confirmed");
      } else if (confs !== w.confirmations) {
        await db.update(cryptoWithdrawalsTable).set({ confirmations: confs })
          .where(eq(cryptoWithdrawalsTable.id, w.id));
      }
    } catch (e) {
      errors++;
      logger.warn({ withdrawalId: w.id, err: (e as Error).message }, "Confirmation check failed");
    }
  }
  return { checked, confirmed, errors };
}

async function tick(): Promise<void> {
  // Multi-server safety: only the elected leader processes withdrawals,
  // otherwise N replicas would all try to broadcast the same on-chain
  // transaction and we'd lose money to double sends.
  const { isLeader } = await import("./leader");
  if (!isLeader()) return;
  if (running) return;
  running = true;
  try {
    lastResult = await scanBroadcasting();
    lastRunAt = new Date();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "Withdrawal watcher tick failed");
  } finally {
    running = false;
  }
}

export function startWithdrawalWatcher(): void {
  if (timer) return;
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Withdrawal confirmation watcher started");
  timer = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  void tick();
}

export function stopWithdrawalWatcher(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function getWatcherStatus(): { running: boolean; intervalMs: number; lastRunAt: Date | null; lastResult: typeof lastResult } {
  return { running: timer !== null, intervalMs: POLL_INTERVAL_MS, lastRunAt, lastResult };
}
