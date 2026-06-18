import { promises as fsp } from "node:fs";
import path from "node:path";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  tradesTable,
  walletsTable,
  pairsTable,
  usersTable,
  type Wallet,
} from "@workspace/db";
import { logger } from "../../logger";
import { getSpotFeeRates } from "../../../routes/fees";
import type { Trade, AutoCancelEvent, Side } from "../types";
import type { SymbolRegistry, SymbolRule } from "./symbol-registry";

// Async settlement worker — the bridge between the in-memory matching
// engine and the Postgres source-of-truth.
//
// Each engine `trade` event triggers ONE atomic Postgres transaction that:
//
//   1. SELECT FOR UPDATE the maker + taker order rows
//   2. SELECT FOR UPDATE the relevant wallets (4 in total, two per user)
//   3. Move qty: debit taker locked → credit base/quote, mirror for maker
//   4. Record fees + TDS via the admin-configured rates
//   5. INSERT two trades rows (one per side, exactly like matching-engine.ts)
//   6. UPDATE both orders.filledQty / avgPrice / status
//   7. UPDATE pairs.lastPrice / volume24h / quoteVolume24h
//
// Each `autoCancel` event triggers ONE smaller atomic TX that:
//
//   1. SELECT FOR UPDATE the order
//   2. SELECT FOR UPDATE the appropriate wallet
//   3. Release the locked qty back to balance (the "refund")
//   4. UPDATE order.status = 'cancelled'
//
// We process events serially through an internal queue so two trades
// against the same wallets don't deadlock. Throughput is limited by
// Postgres TX latency (~2-5ms) which dominates the ~10µs in-memory match,
// so the engine's matching speed advantage shows up as lower TAIL latency
// and burstier capacity, not higher steady-state throughput.
//
// On startup the worker reads `lastSettledTradeId` from a side file so it
// can resume after a restart (engine WAL replays trades on its way back
// up, and the worker skips any already-settled tradeIds it sees).

export interface SettlerOptions {
  /** Where to persist `lastSettledTradeId`. Sits in the engine data dir. */
  cursorPath: string;
  /** Where to dump trades that failed to settle (poison pill protection). */
  deadLetterPath: string;
}

export interface SettlerMetrics {
  enqueued: number;
  settled: number;
  refunded: number;
  failed: number;
  queueDepth: number;
  avgSettleMs: number;
  lastSettledTradeId: number;
  lastError: string;
}

type Job =
  | { kind: "trade"; trade: Trade }
  | { kind: "autoCancel"; event: AutoCancelEvent };

export class Settler {
  private readonly opts: SettlerOptions;
  private readonly registry: SymbolRegistry;
  private readonly queue: Job[] = [];
  private draining = false;
  private stopped = false;

  // Metrics
  private enqueued = 0;
  private settled = 0;
  private refunded = 0;
  private failed = 0;
  private avgSettleMs = 0;
  private lastSettledTradeId = 0;
  private lastError = "";
  private cursorPersistAt = 0;

  constructor(registry: SymbolRegistry, opts: SettlerOptions) {
    this.registry = registry;
    this.opts = opts;
  }

  async start(): Promise<void> {
    // Restore cursor — gives operators a hint at the consistency gap if
    // the process died mid-settlement.
    try {
      const buf = await fsp.readFile(this.opts.cursorPath, "utf8");
      const data = JSON.parse(buf) as { lastSettledTradeId?: number };
      this.lastSettledTradeId = Number(data.lastSettledTradeId ?? 0);
    } catch { /* fresh start */ }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    while (this.queue.length || this.draining) {
      await new Promise((r) => setImmediate(r));
    }
    await this.persistCursor(true);
  }

  enqueueTrade(trade: Trade): void {
    if (this.stopped) return;
    if (trade.id <= this.lastSettledTradeId) return; // already settled
    this.queue.push({ kind: "trade", trade });
    this.enqueued++;
    if (!this.draining) this.scheduleDrain();
  }

  enqueueAutoCancel(event: AutoCancelEvent): void {
    if (this.stopped) return;
    this.queue.push({ kind: "autoCancel", event });
    this.enqueued++;
    if (!this.draining) this.scheduleDrain();
  }

  metrics(): SettlerMetrics {
    return {
      enqueued: this.enqueued,
      settled: this.settled,
      refunded: this.refunded,
      failed: this.failed,
      queueDepth: this.queue.length,
      avgSettleMs: Math.round(this.avgSettleMs * 100) / 100,
      lastSettledTradeId: this.lastSettledTradeId,
      lastError: this.lastError,
    };
  }

  // ─── private ───────────────────────────────────────────────────────────

  private scheduleDrain(): void {
    this.draining = true;
    setImmediate(() => void this.drain());
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await this.processOne(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async processOne(job: Job): Promise<void> {
    const start = Date.now();
    try {
      if (job.kind === "trade") {
        await this.settleTrade(job.trade);
        this.settled++;
        this.lastSettledTradeId = Math.max(this.lastSettledTradeId, job.trade.id);
      } else {
        await this.refundAutoCancel(job.event);
        this.refunded++;
      }
      const ms = Date.now() - start;
      this.avgSettleMs = this.avgSettleMs === 0 ? ms : this.avgSettleMs * 0.9 + ms * 0.1;
      // Persist cursor every ~1s to bound recovery work without thrashing the disk.
      const now = Date.now();
      if (now - this.cursorPersistAt > 1000) {
        await this.persistCursor(false);
        this.cursorPersistAt = now;
      }
    } catch (e) {
      this.failed++;
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.error({ err: this.lastError, job }, "settler job failed");
      await this.deadLetter(job, this.lastError);
    }
  }

  // ── Settlement: one trade row → one Postgres TX ─────────────────────────
  private async settleTrade(trade: Trade): Promise<void> {
    const rule = this.registry.get(trade.symbol);
    if (!rule) throw new Error(`Unknown symbol in trade: ${trade.symbol}`);

    const makerOrderId = parseRef(trade.makerRef);
    const takerOrderId = parseRef(trade.takerRef);
    if (makerOrderId === null || takerOrderId === null) {
      // Sandbox-only trades carry no DB refs — skip silently; settler is
      // only meant for prod-engine traffic.
      return;
    }

    await db.transaction(async (tx) => {
      const [maker] = await tx.select().from(ordersTable).where(eq(ordersTable.id, makerOrderId)).for("update").limit(1);
      const [taker] = await tx.select().from(ordersTable).where(eq(ordersTable.id, takerOrderId)).for("update").limit(1);
      if (!maker || !taker) throw new Error(`order not found: maker=${makerOrderId} taker=${takerOrderId}`);

      // Idempotency guard — if both orders are already filled, this trade
      // was settled in a prior process incarnation and we should bail out
      // before re-charging fees. This is conservative (could miss edge
      // cases where a partial fill landed in the DB but cursor lagged) but
      // safe for the common case of a clean restart.
      const makerFilledBefore = Number(maker.filledQty ?? 0);
      const takerFilledBefore = Number(taker.filledQty ?? 0);
      if (makerFilledBefore >= Number(maker.qty) - 1e-12 && takerFilledBefore >= Number(taker.qty) - 1e-12) {
        return;
      }

      const [makerUser] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, maker.userId)).limit(1);
      const [takerUser] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, taker.userId)).limit(1);
      const makerRates = await getSpotFeeRates(Number(makerUser?.vipTier ?? 0));
      const takerRates = await getSpotFeeRates(Number(takerUser?.vipTier ?? 0));

      const fillQty = trade.quantity;
      const tradePrice = trade.price; // maker's price by construction
      const notional = fillQty * tradePrice;
      const takerFee = notional * takerRates.taker;
      const makerFee = notional * makerRates.maker;
      // TDS deducted on the SELLER's quote proceeds for this fill.
      const takerTds = trade.takerSide === "sell" ? notional * takerRates.tds : 0;
      const makerSide: Side = trade.takerSide === "sell" ? "buy" : "sell";
      const makerTds = makerSide === "sell" ? notional * makerRates.tds : 0;

      // Apply wallet movements per side.
      //
      //   Wallet model: `balance` = FREE, `locked` = RESERVED. Total
      //   funds = balance + locked. Lock = balance↓ + locked↑;
      //   release = balance↑ + locked↓.
      //
      //   At placement we locked `qty * limitPrice * (1 + feeBuffer)` for
      //   buys (covers notional + worst-case taker fee, even if the order
      //   ends up as maker) and `qty` of base for sells. At settle, we
      //   release the per-fill slice of that lock, debit the actual
      //   spend (notional + fee + tds), and credit the realized proceeds.
      //   Both maker and taker use the same registry-provided fee buffer
      //   so accounting stays symmetric.
      const feeBuffer = 1 + rule.takerFeeRate * 1.5;

      // refund may be negative if effective fees (VIP/admin override +
      // GST through getSpotFeeRates) exceed the placement-time fee
      // buffer. We apply it AS-IS so the shortfall is debited from the
      // user's free balance — clamping at 0 here would leave the
      // platform short and break the books. We log a warning in that
      // case; if it fires repeatedly the operator should widen the
      // feeBuffer in the symbol registry.
      const warnIfShortfall = (refund: number, who: string) => {
        if (refund < -1e-9) {
          logger.warn({ tradeId: trade.id, refund, who }, "settler: lock buffer too small for actual fees — debiting free balance");
        }
      };

      if (trade.takerSide === "buy") {
        // Taker BUY (limit price ≥ tradePrice).
        const takerLockSlice = fillQty * Number(taker.price) * feeBuffer;
        const takerSpend = notional + takerFee;
        const takerRefund = takerLockSlice - takerSpend;
        warnIfShortfall(takerRefund, "taker_buy");
        await this.applyWalletDelta(tx, taker.userId, rule.quoteCoinId, {
          lockedDelta: -takerLockSlice,
          balanceDelta: takerRefund,
        });
        await this.applyWalletDelta(tx, taker.userId, rule.baseCoinId, {
          balanceDelta: fillQty,
        });

        // Maker SELL: per-fill base lock = fillQty.
        await this.applyWalletDelta(tx, maker.userId, rule.baseCoinId, {
          lockedDelta: -fillQty,
        });
        await this.applyWalletDelta(tx, maker.userId, rule.quoteCoinId, {
          balanceDelta: notional - makerFee - makerTds,
        });
      } else {
        // Taker SELL: per-fill base lock = fillQty.
        await this.applyWalletDelta(tx, taker.userId, rule.baseCoinId, {
          lockedDelta: -fillQty,
        });
        await this.applyWalletDelta(tx, taker.userId, rule.quoteCoinId, {
          balanceDelta: notional - takerFee - takerTds,
        });

        // Maker BUY: per-fill lock = fillQty * makerPrice * feeBuffer.
        // Since maker fills at its OWN price, makerPrice == tradePrice.
        const makerLockSlice = fillQty * tradePrice * feeBuffer;
        const makerSpend = notional + makerFee;
        const makerRefund = makerLockSlice - makerSpend;
        warnIfShortfall(makerRefund, "maker_buy");
        await this.applyWalletDelta(tx, maker.userId, rule.quoteCoinId, {
          lockedDelta: -makerLockSlice,
          balanceDelta: makerRefund,
        });
        await this.applyWalletDelta(tx, maker.userId, rule.baseCoinId, {
          balanceDelta: fillQty,
        });
      }

      // Insert two trade rows (taker + maker) for per-user accounting.
      // isTaker=1 on the aggressive side; isTaker=0 on the resting maker.
      // Admin trade tape filters on isTaker=1 to show exactly 1 row per match.
      await tx.insert(tradesTable).values({
        orderId: taker.id, userId: taker.userId, pairId: rule.pairId,
        side: taker.side, price: String(tradePrice), qty: String(fillQty),
        fee: String(takerFee), tds: String(takerTds), isTaker: 1,
      });
      await tx.insert(tradesTable).values({
        orderId: maker.id, userId: maker.userId, pairId: rule.pairId,
        side: maker.side, price: String(tradePrice), qty: String(fillQty),
        fee: String(makerFee), tds: String(makerTds), isTaker: 0,
      });

      // Update orders. avgPrice is volume-weighted so a sweep across many
      // levels yields the true blended cost basis.
      const newTakerFilled = takerFilledBefore + fillQty;
      const newTakerAvg = newTakerFilled > 0
        ? (takerFilledBefore * Number(taker.avgPrice ?? 0) + fillQty * tradePrice) / newTakerFilled
        : tradePrice;
      const takerFinished = newTakerFilled >= Number(taker.qty) - 1e-12;

      const newMakerFilled = makerFilledBefore + fillQty;
      const newMakerAvg = newMakerFilled > 0
        ? (makerFilledBefore * Number(maker.avgPrice ?? 0) + fillQty * tradePrice) / newMakerFilled
        : tradePrice;
      const makerFinished = newMakerFilled >= Number(maker.qty) - 1e-12;

      await tx.update(ordersTable).set({
        filledQty: String(newTakerFilled),
        avgPrice: String(newTakerAvg.toFixed(8)),
        fee: sql`${ordersTable.fee} + ${String(takerFee)}::numeric`,
        tds: sql`${ordersTable.tds} + ${String(takerTds)}::numeric`,
        status: takerFinished ? "filled" : "partial",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, taker.id));
      await tx.update(ordersTable).set({
        filledQty: String(newMakerFilled),
        avgPrice: String(newMakerAvg.toFixed(8)),
        fee: sql`${ordersTable.fee} + ${String(makerFee)}::numeric`,
        tds: sql`${ordersTable.tds} + ${String(makerTds)}::numeric`,
        status: makerFinished ? "filled" : "partial",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, maker.id));

      // Pair stats — last-trade tape.
      await tx.update(pairsTable).set({
        lastPrice: String(tradePrice),
        volume24h: sql`"volume_24h" + ${String(fillQty)}::numeric`,
        quoteVolume24h: sql`"quote_volume_24h" + ${String(notional)}::numeric`,
      }).where(eq(pairsTable.id, rule.pairId));
    });
  }

  // ── Refund: release locked balance for a self-cancelled order ─────────
  private async refundAutoCancel(event: AutoCancelEvent): Promise<void> {
    const orderId = parseRef(event.ref);
    if (orderId === null) return; // sandbox path
    const rule = this.registry.get(event.symbol);
    if (!rule) throw new Error(`Unknown symbol in autoCancel: ${event.symbol}`);

    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update").limit(1);
      if (!order) return;
      if (order.status === "cancelled" || order.status === "filled") return;

      const lockedQty = event.unfilled;
      const isBuy = order.side === "buy";
      const coinId = isBuy ? rule.quoteCoinId : rule.baseCoinId;
      // Buyer pre-locks include a fee buffer (see prod-engine.insertAndLock).
      // Mirror it here so a self-cancel via STP / IOC remainder doesn't
      // leave the locked column out of sync.
      const buyerFeeBuffer = 1 + rule.takerFeeRate * 1.5;
      const releaseAmount = isBuy ? lockedQty * Number(order.price) * buyerFeeBuffer : lockedQty;

      // Move funds back from `locked` → `balance` (inverse of the lock
       // we placed in prod-engine.insertAndLock).
      await this.applyWalletDelta(tx, order.userId, coinId, {
        lockedDelta: -releaseAmount,
        balanceDelta: releaseAmount,
      });
      await tx.update(ordersTable).set({
        status: "cancelled",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, order.id));
    });
  }

  /** SELECT FOR UPDATE the wallet (creating it lazily if absent), then apply
   *  the requested deltas in a single UPDATE. Locked never goes negative
   *  by construction (we always release the same amount we locked at
   *  placement). */
  private async applyWalletDelta(
    // Drizzle's TX type is private; using `any` keeps the file decoupled
    // from internal Drizzle types without losing the SELECT FOR UPDATE
    // semantics (which the SQL builder enforces).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    userId: number,
    coinId: number,
    delta: { lockedDelta?: number; balanceDelta?: number },
  ): Promise<void> {
    const wallet = await this.ensureWallet(tx, userId, coinId);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (delta.balanceDelta !== undefined && delta.balanceDelta !== 0) {
      updates["balance"] = sql`${walletsTable.balance} + ${String(delta.balanceDelta)}::numeric`;
    }
    if (delta.lockedDelta !== undefined && delta.lockedDelta !== 0) {
      // When releasing locked funds (negative delta), floor at zero so that
      // small buffer discrepancies (feeBuffer vs actual GST-inclusive fee)
      // never push the locked column into negative territory.
      updates["locked"] = delta.lockedDelta < 0
        ? sql`GREATEST(0, ${walletsTable.locked} + ${String(delta.lockedDelta)}::numeric)`
        : sql`${walletsTable.locked} + ${String(delta.lockedDelta)}::numeric`;
    }
    await tx.update(walletsTable).set(updates).where(eq(walletsTable.id, wallet.id));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async ensureWallet(tx: any, userId: number, coinId: number): Promise<Wallet> {
    const [w] = await tx.select().from(walletsTable)
      .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, "spot")))
      .for("update").limit(1);
    if (w) return w as Wallet;
    const [created] = await tx.insert(walletsTable).values({ userId, coinId, walletType: "spot", balance: "0", locked: "0" }).returning();
    const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, created.id)).for("update").limit(1);
    return locked as Wallet;
  }

  private async persistCursor(force: boolean): Promise<void> {
    if (!force && this.lastSettledTradeId === 0) return;
    try {
      await fsp.mkdir(path.dirname(this.opts.cursorPath), { recursive: true });
      await fsp.writeFile(this.opts.cursorPath, JSON.stringify({ lastSettledTradeId: this.lastSettledTradeId, ts: Date.now() }));
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, "settler cursor persist failed");
    }
  }

  private async deadLetter(job: Job, err: string): Promise<void> {
    try {
      await fsp.mkdir(path.dirname(this.opts.deadLetterPath), { recursive: true });
      const line = JSON.stringify({ ts: Date.now(), err, job }) + "\n";
      await fsp.appendFile(this.opts.deadLetterPath, line);
    } catch { /* best effort */ }
  }
}

/** Refs are stringified DB row ids. Returns null for unset / non-numeric
 *  refs (sandbox traffic). */
function parseRef(ref: string | undefined): number | null {
  if (!ref) return null;
  const n = Number(ref);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Helper used by the prod-engine bootstrap to pre-rebuild the open-orders
 *  count + restore resting orders from the DB into the engine. Lives here
 *  so the settler stays focused on the steady state. */
export async function loadOpenOrdersForRecovery(): Promise<Array<{
  id: number; userId: number; pairId: number; side: Side;
  type: string; price: number; qty: number; filledQty: number;
}>> {
  const rows = await db.select({
    id: ordersTable.id,
    userId: ordersTable.userId,
    pairId: ordersTable.pairId,
    side: ordersTable.side,
    type: ordersTable.type,
    price: ordersTable.price,
    qty: ordersTable.qty,
    filledQty: ordersTable.filledQty,
    status: ordersTable.status,
  }).from(ordersTable);
  return rows
    .filter((r) => r.status === "open" || r.status === "partial")
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      pairId: r.pairId,
      side: r.side as Side,
      type: r.type,
      price: Number(r.price),
      qty: Number(r.qty),
      filledQty: Number(r.filledQty),
    }));
}
