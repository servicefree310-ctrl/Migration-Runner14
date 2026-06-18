/**
 * auto-invest-engine.ts  —  INR-mode
 *
 * Balance is stored in INR. Engine runs every N min (admin-configurable, leader-gated).
 * For every active account with balance >= MIN_BALANCE_INR:
 *   1. Generates a realistic AI trade on USDT pairs
 *   2. Converts PnL (USDT → INR) using live rate
 *   3. Reinvest mode  → adds INR PnL to auto-invest balance
 *   4. INR wallet mode → profits credited to INR spot wallet; losses deducted from balance
 */

import {
  db,
  autoInvestAccountsTable,
  autoInvestTradesTable,
  walletsTable,
  walletLedgerTable,
  coinsTable,
  settingsTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { isLeader } from "./leader";
import { logger } from "./logger";
import { getInrRate } from "./price-service";

const MIN_BALANCE_INR = 100; // ₹100 minimum (matches deposit minimum)
let timer: NodeJS.Timeout | null = null;

const PAIRS = [
  { symbol: "BTC/USDT", basePrice: 67000, vol: 0.003 },
  { symbol: "ETH/USDT", basePrice: 3500,  vol: 0.004 },
  { symbol: "SOL/USDT", basePrice: 175,   vol: 0.005 },
  { symbol: "BNB/USDT", basePrice: 600,   vol: 0.003 },
  { symbol: "XRP/USDT", basePrice: 0.62,  vol: 0.006 },
  { symbol: "ADA/USDT", basePrice: 0.45,  vol: 0.005 },
  { symbol: "DOGE/USDT",basePrice: 0.15,  vol: 0.008 },
  { symbol: "AVAX/USDT",basePrice: 38,    vol: 0.006 },
];

const STRATEGIES = [
  "Delta-Neutral Arb", "Momentum Breakout", "Mean Reversion",
  "Trend Following", "Grid Trading", "Scalp HFT",
  "RSI Divergence", "MACD Cross", "Bollinger Squeeze",
];

function sr(seed: number): number {
  const x = Math.sin(seed + 1) * 99991;
  return x - Math.floor(x);
}

async function readTickIntervalMs(): Promise<number> {
  const [row] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "auto_invest_tick_interval_min"))
    .limit(1);
  const minutes = Math.max(1, parseFloat(row?.value ?? "3"));
  return minutes * 60 * 1000;
}

async function runTick(): Promise<void> {
  if (!isLeader()) return;

  const accounts = await db.select().from(autoInvestAccountsTable)
    .where(and(
      eq(autoInvestAccountsTable.status, "active"),
      gte(autoInvestAccountsTable.balance, String(MIN_BALANCE_INR)),
    ));

  if (accounts.length === 0) return;

  const inrRate       = getInrRate() || 84;
  const tickIntervalMs = await readTickIntervalMs();
  const ticksPerDay   = (24 * 60 * 60 * 1000) / tickIntervalMs;
  let processed = 0;

  for (const acct of accounts) {
    try {
      const balanceInr  = parseFloat(acct.balance);
      const balanceUsdt = balanceInr / inrRate;
      const dailyRate   = parseFloat(acct.dailyRatePct) / 100;
      const tickRate    = dailyRate / ticksPerDay;

      const seed     = acct.userId * 7919 + (Date.now() % 86_400_000);
      const isWin    = sr(seed) < 0.72;
      const pair     = PAIRS[Math.floor(sr(seed + 1) * PAIRS.length)];
      const strategy = STRATEGIES[Math.floor(sr(seed + 2) * STRATEGIES.length)];
      const side     = sr(seed + 3) > 0.5 ? "buy" : "sell";

      const entryMov = (sr(seed + 4) - 0.5) * 2 * pair.vol;
      const entryP   = pair.basePrice * (1 + entryMov);
      const exitMov  = isWin
        ? sr(seed + 5) * pair.vol * 0.6
        : -(sr(seed + 5) * pair.vol * 0.3);
      const exitP    = entryP * (1 + (side === "buy" ? exitMov : -exitMov));

      const pnlPct  = isWin
        ? tickRate * (1.3 + sr(seed + 6) * 0.4)
        : -(tickRate * (0.3 + sr(seed + 7) * 0.2));

      const pnlUsdt  = balanceUsdt * pnlPct;
      const pnlInr   = pnlUsdt * inrRate;
      const tradeAmt = balanceUsdt * (0.05 + sr(seed + 8) * 0.10);

      const now   = new Date();
      const openT = new Date(now.getTime() - Math.floor(sr(seed + 9) * 120_000 + 30_000));

      await db.insert(autoInvestTradesTable).values({
        accountId:  acct.id,
        userId:     acct.userId,
        pair:       pair.symbol,
        side,
        entryPrice: entryP.toFixed(6),
        exitPrice:  exitP.toFixed(6),
        amountUsdt: tradeAmt.toFixed(4),
        pnlUsdt:    pnlUsdt.toFixed(6),
        pnlPct:     (pnlPct * 100).toFixed(6),
        isWin,
        strategy,
        openedAt:   openT,
        closedAt:   now,
      });

      {
        // Profits go to INR spot wallet; losses reduce auto-invest balance
        const newBal = Math.max(0, balanceInr + pnlInr);
        await db.update(autoInvestAccountsTable).set({
          balance:     newBal.toFixed(4),
          totalEarned: pnlInr > 0
            ? sql`${autoInvestAccountsTable.totalEarned} + ${pnlInr.toFixed(4)}`
            : autoInvestAccountsTable.totalEarned,
          status: newBal < MIN_BALANCE_INR ? "paused" : acct.status,
          updatedAt: now,
        }).where(eq(autoInvestAccountsTable.id, acct.id));

        if (pnlInr > 0) {
          const [inrCoin] = await db.select().from(coinsTable)
            .where(eq(coinsTable.symbol, "INR")).limit(1);
          if (inrCoin) {
            // Credit profits to fiat "inr" wallet (same wallet as bank/UPI deposits)
          const [wallet] = await db.select().from(walletsTable)
              .where(and(
                eq(walletsTable.userId, acct.userId),
                eq(walletsTable.coinId, inrCoin.id),
                eq(walletsTable.walletType, "inr"),
              )).limit(1);
            if (wallet) {
              const balBefore = wallet.balance;
              const balAfter  = (parseFloat(balBefore) + pnlInr).toFixed(4);
              await db.update(walletsTable)
                .set({ balance: balAfter, updatedAt: now })
                .where(eq(walletsTable.id, wallet.id));
              await db.insert(walletLedgerTable).values({
                userId:        acct.userId,
                coinId:        inrCoin.id,
                walletType:    "inr",
                type:          "ai_earning",
                amount:        pnlInr.toFixed(4),
                balanceBefore: String(balBefore),
                balanceAfter:  balAfter,
                refId:         `auto_invest_${acct.id}_${now.getTime()}`,
                note:          `Auto-invest profit: ₹${pnlInr.toFixed(2)} (${pnlUsdt.toFixed(4)} USDT)`,
                createdAt:     now,
              });
            }
          }
        }
      }

      processed++;
    } catch (err: any) {
      logger.warn({ err: err?.message, userId: acct.userId }, "auto-invest-engine: account tick failed");
    }
  }

  if (processed > 0) logger.info({ processed }, "auto-invest-engine: tick done");
}

async function scheduleNext(): Promise<void> {
  const intervalMs = await readTickIntervalMs();
  timer = setTimeout(async () => {
    await runTick();
    void scheduleNext();
  }, intervalMs);
}

export function startAutoInvestEngine(): void {
  if (timer) return;
  logger.info("auto-invest-engine: starting");
  void runTick().then(() => { void scheduleNext(); });
}

export function stopAutoInvestEngine(): void {
  if (timer) { clearTimeout(timer); timer = null; }
}
