/**
 * Options settlement engine.
 *
 * Runs once a minute (leader-gated, same as futures-engine) and:
 *   1) marks any active contract whose expiry has passed → status='expired'
 *   2) for each newly-expired contract: snapshots the spot price (from the
 *      underlying coin's currentPrice) as the settlementPrice, then walks
 *      every open position and pays/charges the intrinsic-value payoff:
 *
 *        long  call payoff per contract = max(0, spot - strike)
 *        long  put  payoff per contract = max(0, strike - spot)
 *        short call: pays the long side  (debits margin)
 *        short put : pays the long side  (debits margin)
 *
 *      Settlement is in the contract's quoteCoinSymbol (default USDT). The
 *      margin row is unlocked atomically; payoff credits/debits the user's
 *      spot wallet.
 *   3) marks the contract status='settled' so it never re-runs.
 *
 * Idempotent — only runs over rows still flagged 'active' (step 1) and
 * 'expired' with status NOT 'settled' (step 2). Failure on one contract
 * doesn't stop the loop; we log + skip.
 */
import { db, optionContractsTable, optionPositionsTable, coinsTable, walletsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { isLeader } from "./leader";

let timer: NodeJS.Timeout | null = null;
const TICK_MS = 60_000;

async function tickSettleExpired(): Promise<void> {
  // Step 1 — mark ripe contracts as expired
  const ripe = await db.select().from(optionContractsTable).where(
    and(eq(optionContractsTable.status, "active"), lte(optionContractsTable.expiryAt, new Date())),
  );
  for (const c of ripe) {
    try {
      // Snapshot underlying spot for this contract
      const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.id, c.underlyingCoinId)).limit(1);
      if (!coin) {
        logger.warn({ contractId: c.id }, "options.settle: underlying coin missing — skipping");
        continue;
      }
      const spot = Number(coin.currentPrice);
      if (!isFinite(spot) || spot <= 0) {
        logger.warn({ contractId: c.id, spot }, "options.settle: invalid spot — skipping");
        continue;
      }

      await db.transaction(async (tx) => {
        // Mark expired with snapshot
        await tx.update(optionContractsTable).set({
          status: "expired",
          settlementPrice: String(spot),
        }).where(and(eq(optionContractsTable.id, c.id), eq(optionContractsTable.status, "active")));

        // Walk open positions for this contract
        const positions = await tx.select().from(optionPositionsTable).where(
          and(eq(optionPositionsTable.contractId, c.id), eq(optionPositionsTable.status, "open")),
        );

        const strike = Number(c.strikePrice);
        const intrinsic = c.optionType === "call"
          ? Math.max(0, spot - strike)
          : Math.max(0, strike - spot);

        for (const p of positions) {
          const qty = Number(p.qty);
          const payoff = intrinsic * qty * Number(c.contractSize);
          const pnl = p.side === "long"
            ? payoff - Number(p.avgEntryPremium) * qty   // long paid premium upfront
            : Number(p.avgEntryPremium) * qty - payoff;  // short collected premium

          // Find user's quote-asset spot wallet (default USDT)
          const [quoteCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, c.quoteCoinSymbol)).limit(1);
          if (!quoteCoin) {
            logger.warn({ symbol: c.quoteCoinSymbol }, "options.settle: quote coin missing — position unsettled");
            continue;
          }
          const [w] = await tx.select().from(walletsTable).where(
            and(eq(walletsTable.userId, p.userId), eq(walletsTable.coinId, quoteCoin.id), eq(walletsTable.walletType, "spot")),
          ).for("update").limit(1);

          if (w) {
            // Unlock any margin (shorts) and credit/debit balance with PnL
            const margin = Number(p.marginLocked);
            await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} + ${margin + pnl}`,
              locked:  sql`${walletsTable.locked}  - ${margin}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, w.id));
          } else if (p.side === "long") {
            // Create wallet on payoff for longs (rare — implies user had no quote balance)
            await tx.insert(walletsTable).values({
              userId: p.userId, coinId: quoteCoin.id, walletType: "spot",
              balance: String(Math.max(0, payoff)), locked: "0",
            });
          }

          await tx.update(optionPositionsTable).set({
            status: "settled",
            realizedPnl: String(pnl),
            closedAt: new Date(),
            closeReason: "expiry_settle",
            marginLocked: "0",
          }).where(eq(optionPositionsTable.id, p.id));
        }

        // Final flag — contract is now fully settled
        await tx.update(optionContractsTable).set({
          status: "settled",
          settledAt: new Date(),
        }).where(eq(optionContractsTable.id, c.id));
      });

      logger.info({ contractId: c.id, symbol: c.symbol, spot }, "options.settle: contract settled");
    } catch (e) {
      logger.error({ err: e, contractId: c.id }, "options.settle: tick failed");
    }
  }
}

export function startOptionsEngine(): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (!isLeader()) return;
    try { await tickSettleExpired(); } catch (e) { logger.error({ err: e }, "options-engine tick error"); }
  }, TICK_MS);
  // Run once shortly after boot so anything already expired clears
  setTimeout(() => { if (isLeader()) void tickSettleExpired(); }, 5_000);
}
