import {
  db, pairsTable, coinsTable, fundingRatesTable, futuresPositionsTable,
  fundingPaymentsTable, walletsTable, walletLedgerTable,
} from "@workspace/db";
import { eq, and, sql, lte, isNull, inArray, or, gt } from "drizzle-orm";
import { logger } from "./logger";
import { getCache } from "./price-service";

const FUNDING_TICK_MS = 60_000;
const SETTLE_TICK_MS = 30_000;
const RISK_TICK_MS = 5_000;

let fTimer: NodeJS.Timeout | null = null;
let sTimer: NodeJS.Timeout | null = null;
let rTimer: NodeJS.Timeout | null = null;
let busy = { funding: false, settle: false, risk: false };

let lastStatus = {
  fundingCreated: 0,
  fundingSettled: 0,
  totalSettlementValue: 0,
  positionsLiquidated: 0,
  positionsChecked: 0,
  lastRiskAt: null as Date | null,
  lastFundingAt: null as Date | null,
  lastSettleAt: null as Date | null,
};

// Round up "now" to next slot boundary (UTC) of intervalHours.
// e.g. interval=8h -> slots at 00:00, 08:00, 16:00 UTC.
function nextSlot(now: Date, intervalHours: number): Date {
  const ms = intervalHours * 3600 * 1000;
  const t = Math.ceil(now.getTime() / ms) * ms;
  return new Date(t === now.getTime() ? t + ms : t);
}

function priceForSymbol(symbol: string): number | null {
  const tick = getCache().find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  return tick ? Number(tick.usdt) : null;
}

// ─── 1. Auto-create next funding rate row for every futures pair ──────────────
export async function tickAutoFunding(): Promise<number> {
  if (busy.funding) return 0;
  busy.funding = true;
  let created = 0;
  try {
    const pairs = await db.select().from(pairsTable).where(eq(pairsTable.futuresEnabled, true));
    const now = new Date();
    for (const p of pairs) {
      if (p.fundingAutoCreate !== "true") continue;
      const interval = p.fundingIntervalHours || 8;
      const next = nextSlot(now, interval);
      // Check if a row for this slot already exists
      const existing = await db.select({ id: fundingRatesTable.id })
        .from(fundingRatesTable)
        .where(and(eq(fundingRatesTable.pairId, p.id), eq(fundingRatesTable.fundingTime, next)))
        .limit(1);
      if (existing.length > 0) continue;

      // Compute rate: base + small drift influenced by 24h price change (premium proxy)
      const base = Number(p.baseFundingRate);
      const change = Number(p.change24h ?? 0);
      // Cap influence: ±0.0005 from change
      const drift = Math.max(-0.0005, Math.min(0.0005, (change / 100) * 0.05));
      const rate = (base + drift).toFixed(6);

      await db.insert(fundingRatesTable).values({
        pairId: p.id, rate, intervalHours: interval, fundingTime: next, source: "auto", settled: "false",
      });
      created++;
    }
    if (created > 0) logger.info({ created }, "Auto-created funding rate slots");
    lastStatus.fundingCreated += created;
    lastStatus.lastFundingAt = new Date();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "tickAutoFunding failed");
  } finally {
    busy.funding = false;
  }
  return created;
}

// ─── 2. Settle due funding rows: charge / credit positions open AT funding time ──
export async function tickSettleFunding(): Promise<{ settled: number; totalValue: number }> {
  if (busy.settle) return { settled: 0, totalValue: 0 };
  busy.settle = true;
  let settled = 0;
  let totalValue = 0;
  try {
    // Atomic claim: pick due unsettled rows and mark 'processing' in single statement
    const claimed = await db.update(fundingRatesTable)
      .set({ settled: "processing" })
      .where(and(
        eq(fundingRatesTable.settled, "false"),
        lte(fundingRatesTable.fundingTime, new Date()),
      ))
      .returning();

    for (const fr of claimed) {
      // Eligible positions: opened BEFORE fundingTime AND (still open OR closed AFTER fundingTime)
      const positions = await db.select().from(futuresPositionsTable).where(and(
        eq(futuresPositionsTable.pairId, fr.pairId),
        lte(futuresPositionsTable.openedAt, fr.fundingTime),
        or(
          eq(futuresPositionsTable.status, "open"),
          gt(futuresPositionsTable.closedAt, fr.fundingTime),
        ),
      ));
      let totalPaid = 0;
      let positionsAffected = 0;
      const rate = Number(fr.rate);

      const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, fr.pairId)).limit(1);
      if (!pair) continue;

      for (const pos of positions) {
        const entry = Number(pos.entryPrice);
        const qty = Number(pos.qty);
        const positionValue = entry * qty;
        const payment = positionValue * rate * (pos.side === "long" ? 1 : -1);

        try {
          await db.transaction(async (trx) => {
            const [w] = await trx.select().from(walletsTable).where(and(
              eq(walletsTable.userId, pos.userId),
              eq(walletsTable.coinId, pair.quoteCoinId),
              eq(walletsTable.walletType, "futures"),
            )).for("update").limit(1);
            if (!w) return;

            // Charge from free balance first. When free balance is insufficient
            // (all equity is in locked position margin), deduct the shortfall
            // directly from the position's marginAmount so the risk engine sees
            // the reduced equity on its next tick and can trigger liquidation if
            // necessary. Never let wallet.balance go negative.
            const freeBalance = Math.max(0, Number(w.balance));
            const fromBalance = Math.min(freeBalance, payment);
            const fromMargin = payment - fromBalance;

            await trx.update(walletsTable).set({
              balance: sql`GREATEST(0, ${walletsTable.balance} - ${payment})`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, w.id));

            if (fromMargin > 0.000001) {
              await trx.update(futuresPositionsTable).set({
                marginAmount: sql`GREATEST(0, ${futuresPositionsTable.marginAmount} - ${fromMargin})`,
              }).where(eq(futuresPositionsTable.id, pos.id));
            }

            // Unique constraint on (fundingRateId, positionId) prevents double-charge on retry
            await trx.insert(fundingPaymentsTable).values({
              positionId: pos.id, userId: pos.userId, pairId: fr.pairId, fundingRateId: fr.id,
              rate: String(rate), positionValue: String(positionValue.toFixed(8)),
              payment: String(payment.toFixed(8)),
            });
          });
          totalPaid += Math.abs(payment);
          positionsAffected++;
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("duplicate key") || msg.includes("unique")) {
            // Already paid — safe to skip
            continue;
          }
          throw e;
        }
      }

      await db.update(fundingRatesTable).set({
        settled: "true", settledAt: new Date(),
        positionsAffected, totalPaid: String(totalPaid.toFixed(8)),
      }).where(eq(fundingRatesTable.id, fr.id));
      settled++;
      totalValue += totalPaid;
    }
    if (settled > 0) logger.info({ settled, totalValue }, "Funding settlements complete");
    lastStatus.fundingSettled += settled;
    lastStatus.totalSettlementValue += totalValue;
    lastStatus.lastSettleAt = new Date();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "tickSettleFunding failed");
  } finally {
    busy.settle = false;
  }
  return { settled, totalValue };
}

// Closed-form liquidation price for isolated margin
function calcLiqPrice(side: string, entry: number, qty: number, margin: number, mmRate: number): number {
  if (qty <= 0) return 0;
  if (side === "long") {
    // (liq - entry)*qty = -(margin - liq*qty*mmRate)
    // liq = (entry*qty - margin) / (qty*(1 - mmRate))
    const denom = qty * (1 - mmRate);
    return denom > 0 ? Math.max(0, (entry * qty - margin) / denom) : 0;
  } else {
    // (entry - liq)*qty = -(margin - liq*qty*mmRate)
    // liq = (entry*qty + margin) / (qty*(1 + mmRate))
    return (entry * qty + margin) / (qty * (1 + mmRate));
  }
}

// ─── 3a. Force-close a position at mark price for SL/TP trigger ──────────────
async function closeSLTP(
  pos: { id: number; userId: number; side: string; qty: string; entryPrice: string; marginAmount: string },
  mark: number,
  pair: { quoteCoinId: number; takerFeeRate?: string | number | null },
  reason: "stop_loss" | "take_profit",
): Promise<boolean> {
  const qty = Number(pos.qty);
  const entry = Number(pos.entryPrice);
  const margin = Number(pos.marginAmount);
  const direction = pos.side === "long" ? 1 : -1;
  const pnl = (mark - entry) * qty * direction;
  const feeRate = Number(pair.takerFeeRate ?? 0.0006);
  const fee = qty * mark * feeRate;
  const net = pnl - fee;

  return await db.transaction(async (trx) => {
    const [locked] = await trx.select().from(futuresPositionsTable)
      .where(and(eq(futuresPositionsTable.id, pos.id), eq(futuresPositionsTable.status, "open")))
      .for("update").limit(1);
    if (!locked) return false;

    const [w] = await trx.select().from(walletsTable).where(and(
      eq(walletsTable.userId, pos.userId),
      eq(walletsTable.coinId, pair.quoteCoinId),
      eq(walletsTable.walletType, "futures"),
    )).for("update").limit(1);
    if (w) {
      // Return the full position margin to balance, then apply net PnL after fee.
      // The margin principal must be restored first (it was held in `locked`);
      // only the net (pnl - fee) determines whether the user gains or loses on top.
      const balBefore = Number(w.balance);
      const balAfter  = Math.max(0, balBefore + margin + net);
      await trx.update(walletsTable).set({
        locked: sql`GREATEST(0, ${walletsTable.locked} - ${margin})`,
        balance: sql`GREATEST(0, ${walletsTable.balance} + ${margin} + ${net})`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
      await trx.insert(walletLedgerTable).values({
        userId: pos.userId,
        coinId: pair.quoteCoinId,
        walletType: "futures",
        type: "futures_pnl",
        amount: (margin + net).toFixed(8),
        balanceBefore: w.balance,
        balanceAfter: balAfter.toFixed(8),
        refType: "futures_trade",
        note: `${reason === "stop_loss" ? "Stop loss" : "Take profit"} @ ${mark.toFixed(8)} — margin=${margin.toFixed(8)}, pnl=${pnl.toFixed(8)}, fee=${fee.toFixed(8)}`,
      });
    }

    const upd = await trx.update(futuresPositionsTable).set({
      qty: "0", marginAmount: "0",
      status: "closed", closedAt: new Date(),
      closeReason: reason === "stop_loss" ? `Stop loss triggered @ ${mark.toFixed(8)}` : `Take profit triggered @ ${mark.toFixed(8)}`,
      markPrice: String(mark),
      realizedPnl: sql`${futuresPositionsTable.realizedPnl} + ${pnl}`,
    }).where(and(eq(futuresPositionsTable.id, pos.id), eq(futuresPositionsTable.status, "open"))).returning();
    return upd.length > 0;
  });
}

// ─── 3. Risk: mark-to-market & liquidate breached positions ──────────────────
export interface RiskCheckResult {
  checked: number;
  liquidated: number;
  nearLiquidation: number;
}

export async function tickRiskCheck(): Promise<RiskCheckResult> {
  if (busy.risk) return { checked: 0, liquidated: 0, nearLiquidation: 0 };
  busy.risk = true;
  let checked = 0, liquidated = 0, nearLiquidation = 0;
  try {
    const positions = await db.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.status, "open"));
    if (positions.length === 0) return { checked, liquidated, nearLiquidation };

    const pairIds = Array.from(new Set(positions.map((p) => p.pairId)));
    const pairs = await db.select().from(pairsTable).where(inArray(pairsTable.id, pairIds));
    const pairMap = new Map(pairs.map((p) => [p.id, p] as const));
    const coins = await db.select().from(coinsTable);
    const coinMap = new Map(coins.map((c) => [c.id, c] as const));

    for (const pos of positions) {
      checked++;
      const pair = pairMap.get(pos.pairId);
      if (!pair) continue;
      const baseCoin = coinMap.get(pair.baseCoinId);
      const quoteCoin = coinMap.get(pair.quoteCoinId);
      if (!baseCoin || !quoteCoin) continue;
      const sym = `${baseCoin.symbol}${quoteCoin.symbol}`;
      const mark = priceForSymbol(sym) ?? Number(pair.lastPrice);
      if (!mark || mark <= 0) continue;

      const entry = Number(pos.entryPrice);
      const qty = Number(pos.qty);
      const margin = Number(pos.marginAmount);
      const mmRate = Number(pair.mmRate);

      const direction = pos.side === "long" ? 1 : -1;
      const uPnl = (mark - entry) * qty * direction;
      const equity = margin + uPnl;
      const positionValue = mark * qty;
      const maintMargin = positionValue * mmRate;
      const liqPrice = calcLiqPrice(pos.side, entry, qty, margin, mmRate);

      // SL/TP trigger — evaluated before liquidation so user-set exits fire first.
      // Uses pos.stopLoss / pos.takeProfit written by applyFills() when the
      // position-opening order had SL/TP specified.
      const stopLoss = (pos as any).stopLoss ? Number((pos as any).stopLoss) : null;
      const takeProfit = (pos as any).takeProfit ? Number((pos as any).takeProfit) : null;
      const isLong = pos.side === "long";
      if (stopLoss && ((isLong && mark <= stopLoss) || (!isLong && mark >= stopLoss))) {
        const triggered = await closeSLTP(pos, mark, pair, "stop_loss");
        if (triggered) logger.info({ positionId: pos.id, userId: pos.userId, mark, stopLoss }, "Stop loss triggered");
        if (triggered) continue;
      }
      if (takeProfit && ((isLong && mark >= takeProfit) || (!isLong && mark <= takeProfit))) {
        const triggered = await closeSLTP(pos, mark, pair, "take_profit");
        if (triggered) logger.info({ positionId: pos.id, userId: pos.userId, mark, takeProfit }, "Take profit triggered");
        if (triggered) continue;
      }

      if (equity <= maintMargin) {
        // Atomic liquidate: only succeeds if still 'open'
        const liquidatedNow = await db.transaction(async (trx) => {
          const [locked] = await trx.select().from(futuresPositionsTable)
            .where(and(eq(futuresPositionsTable.id, pos.id), eq(futuresPositionsTable.status, "open")))
            .for("update").limit(1);
          if (!locked) return false;
          const [w] = await trx.select().from(walletsTable).where(and(
            eq(walletsTable.userId, pos.userId),
            eq(walletsTable.coinId, pair.quoteCoinId),
            eq(walletsTable.walletType, "futures"),
          )).for("update").limit(1);
          if (w) {
            const remaining = Math.max(0, equity - maintMargin);
            if (remaining > 0) {
              await trx.update(walletsTable).set({
                balance: sql`${walletsTable.balance} + ${remaining}`,
                locked: sql`${walletsTable.locked} - ${margin}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            } else {
              await trx.update(walletsTable).set({
                locked: sql`${walletsTable.locked} - ${margin}`,
                updatedAt: new Date(),
              }).where(eq(walletsTable.id, w.id));
            }
          }
          const upd = await trx.update(futuresPositionsTable).set({
            status: "liquidated",
            closedAt: new Date(),
            closeReason: `Liquidated @ ${mark.toFixed(8)} (equity ${equity.toFixed(4)} <= mm ${maintMargin.toFixed(4)})`,
            markPrice: String(mark),
            unrealizedPnl: String(uPnl.toFixed(8)),
            realizedPnl: String(uPnl.toFixed(8)),
            liquidationPrice: String(liqPrice.toFixed(8)),
          }).where(and(eq(futuresPositionsTable.id, pos.id), eq(futuresPositionsTable.status, "open"))).returning();
          return upd.length > 0;
        });
        if (liquidatedNow) {
          liquidated++;
          logger.warn({ positionId: pos.id, userId: pos.userId, mark, equity, maintMargin }, "Position liquidated");
        }
      } else {
        // Just update mark + uPnl + liq price
        const distance = Math.abs(mark - liqPrice) / mark;
        if (distance < 0.05) nearLiquidation++;
        await db.update(futuresPositionsTable).set({
          markPrice: String(mark),
          unrealizedPnl: String(uPnl.toFixed(8)),
          liquidationPrice: String(liqPrice.toFixed(8)),
        }).where(eq(futuresPositionsTable.id, pos.id));
      }
    }
    lastStatus.positionsChecked = checked;
    lastStatus.positionsLiquidated += liquidated;
    lastStatus.lastRiskAt = new Date();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "tickRiskCheck failed");
  } finally {
    busy.risk = false;
  }
  return { checked, liquidated, nearLiquidation };
}

export function startFuturesEngine(): void {
  if (fTimer || sTimer || rTimer) return;
  logger.info("Futures engine starting (auto-funding 60s, settle 30s, risk 5s, leader-gated)");
  // Multi-server safety: cron-style ticks run only on the leader. Admin
  // routes (`/admin/futures/funding/run` etc.) can still call the exported
  // tick functions directly to force a run on any replica — duplicates
  // are impossible there because the HTTP request only hits one process.
  const guard = (fn: () => Promise<unknown>) => async () => {
    const { isLeader } = await import("./leader");
    if (isLeader()) void fn();
  };
  fTimer = setInterval(guard(tickAutoFunding), FUNDING_TICK_MS);
  sTimer = setInterval(guard(tickSettleFunding), SETTLE_TICK_MS);
  rTimer = setInterval(guard(tickRiskCheck), RISK_TICK_MS);
  // Initial fire-and-forget on startup, also leader-gated.
  void guard(tickAutoFunding)();
  void guard(tickSettleFunding)();
  void guard(tickRiskCheck)();
}

export function stopFuturesEngine(): void {
  if (fTimer) clearInterval(fTimer);
  if (sTimer) clearInterval(sTimer);
  if (rTimer) clearInterval(rTimer);
  fTimer = sTimer = rTimer = null;
}

export function getFuturesEngineStatus() {
  return { ...lastStatus, intervals: { funding: FUNDING_TICK_MS, settle: SETTLE_TICK_MS, risk: RISK_TICK_MS } };
}

// Suppress unused
void isNull;
