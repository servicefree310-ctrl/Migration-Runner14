/**
 * Stop-Order Engine
 *
 * Polls the DB every 2 s for orders with status="pending_trigger" and type
 * in ("stop_limit","stop_market").  When the current pair last-price crosses
 * the order's stopPrice, it activates the order and feeds it into the spot
 * matching engine (tryMatch).
 *
 * Trigger semantics (standard exchange convention):
 *   BUY  stop  — triggered when lastPrice >= stopPrice  (e.g. buy-stop-market entry)
 *   SELL stop  — triggered when lastPrice <= stopPrice  (e.g. stop-loss)
 *
 * OCO bracket: SL (stop_market) orders placed alongside a PL (limit) share an
 * ocoGroupId.  At trigger time, the engine:
 *   1. Cancels the PL partner (refunding its locked balance back to free).
 *   2. Locks the SL order's balance from the newly-freed funds.
 *   3. Activates the SL and runs it through the matching engine.
 *
 * Only the cluster leader runs this loop; replicas skip via isLeader() guard.
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import { db, ordersTable, pairsTable, walletsTable, coinsTable } from "@workspace/db";
import { logger } from "./logger";
import { isLeader } from "./leader";
import { tryMatch } from "./matching-engine";
import { cancelOcoPartners } from "./oco";
import { rZadd, rSet, rPublish } from "./redis";
import { getSpotFeeRates } from "../routes/fees";

const POLL_MS = 2000;
let _timer: ReturnType<typeof setInterval> | null = null;

export function startStopOrderEngine(): void {
  if (_timer) return;
  _timer = setInterval(() => {
    if (!isLeader()) return;
    void checkAndTriggerStops();
  }, POLL_MS);
  logger.info("Stop-order engine started (leader-gated, 2 s poll)");
}

export function stopStopOrderEngine(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function checkAndTriggerStops(): Promise<void> {
  try {
    const pending = await db.select({
      id:         ordersTable.id,
      userId:     ordersTable.userId,
      pairId:     ordersTable.pairId,
      side:       ordersTable.side,
      type:       ordersTable.type,
      price:      ordersTable.price,
      stopPrice:  ordersTable.stopPrice,
      qty:        ordersTable.qty,
      filledQty:  ordersTable.filledQty,
      ocoGroupId: ordersTable.ocoGroupId,
      noLock:     ordersTable.noLock,
    }).from(ordersTable)
      .where(and(
        inArray(ordersTable.type as any, ["stop_limit", "stop_market"]),
        eq(ordersTable.status, "pending_trigger"),
      ))
      .limit(100);

    if (pending.length === 0) return;

    const pairIds = [...new Set(pending.map((o) => o.pairId))];
    const pairs = await db.select({
      id:                pairsTable.id,
      symbol:            pairsTable.symbol,
      lastPrice:         pairsTable.lastPrice,
      marketSlippagePct: (pairsTable as any).marketSlippagePct,
      baseCoinId:        pairsTable.baseCoinId,
      quoteCoinId:       pairsTable.quoteCoinId,
    }).from(pairsTable)
      .where(inArray(pairsTable.id, pairIds));

    const pairMap = new Map(pairs.map((p) => [p.id, p]));

    for (const order of pending) {
      const pair = pairMap.get(order.pairId);
      if (!pair) continue;
      const currentPrice = Number(pair.lastPrice);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      const stopPx = Number(order.stopPrice ?? 0);
      if (!Number.isFinite(stopPx) || stopPx <= 0) continue;

      const triggered =
        (order.side === "sell" && currentPrice <= stopPx) ||
        (order.side === "buy"  && currentPrice >= stopPx);

      if (triggered) {
        await triggerOrder(order, pair, currentPrice);
      }
    }
  } catch (err) {
    logger.warn({ err }, "stop-order-engine check failed");
  }
}

async function triggerOrder(order: any, pair: any, currentPrice: number): Promise<void> {
  try {
    const slippage = Number((pair as any).marketSlippagePct ?? 0.10);

    // ── OCO bracket handling ──────────────────────────────────────────────
    // noLock=1 means this SL order was placed without locking balance (the PL
    // leg holds the lock).  We must:
    //   1. Cancel the PL partner first → its lock returns to free balance.
    //   2. Lock balance for this SL order from the newly-freed funds.
    //   3. If balance is insufficient, cancel the SL and bail.
    if (Number(order.noLock) === 1) {
      if (order.ocoGroupId) {
        await cancelOcoPartners(order.ocoGroupId, order.id);
      }

      const bracketQty = Number(order.qty) - Number(order.filledQty ?? 0);
      if (bracketQty > 1e-8) {
        const newPx = order.side === "buy"
          ? currentPrice * (1 + slippage)
          : currentPrice * (1 - slippage);

        const balanceLocked = await db.transaction(async (tx) => {
          if (order.side === "sell") {
            const [w] = await tx.select().from(walletsTable)
              .where(and(
                eq(walletsTable.userId, order.userId),
                eq(walletsTable.coinId, pair.baseCoinId),
                eq(walletsTable.walletType, "spot"),
              ))
              .for("update").limit(1);
            const bal = Number(w?.balance ?? 0);
            if (bal < bracketQty - 1e-8) {
              await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
              return false;
            }
            if (w) await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} - ${bracketQty}`,
              locked:  sql`${walletsTable.locked}  + ${bracketQty}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, w.id));
          } else {
            const [coinRow] = await tx.select({ symbol: coinsTable.symbol })
              .from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)).limit(1);
            const quoteWt = coinRow?.symbol === "INR" ? "inr" : "spot";
            const fees = await getSpotFeeRates(0);
            const lockAmt = bracketQty * newPx * (1 + fees.taker);
            const [w] = await tx.select().from(walletsTable)
              .where(and(
                eq(walletsTable.userId, order.userId),
                eq(walletsTable.coinId, pair.quoteCoinId),
                eq(walletsTable.walletType, quoteWt),
              ))
              .for("update").limit(1);
            const bal = Number(w?.balance ?? 0);
            if (bal < lockAmt - 1e-8) {
              await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
              return false;
            }
            if (w) await tx.update(walletsTable).set({
              balance: sql`${walletsTable.balance} - ${lockAmt}`,
              locked:  sql`${walletsTable.locked}  + ${lockAmt}`,
              updatedAt: new Date(),
            }).where(eq(walletsTable.id, w.id));
          }
          return true;
        });

        if (!balanceLocked) {
          logger.warn({ orderId: order.id }, "SL OCO order cancelled: insufficient balance at trigger time");
          return;
        }
      }
    }

    if (order.type === "stop_market") {
      // Recalculate slippage cap at trigger time (price has moved since placement)
      const newPrice = order.side === "buy"
        ? currentPrice * (1 + slippage)
        : currentPrice * (1 - slippage);

      const updated = await db.update(ordersTable).set({
        status: "open",
        price:  String(newPrice),
        updatedAt: new Date(),
      }).where(and(
        eq(ordersTable.id, order.id),
        eq(ordersTable.status, "pending_trigger"),
      )).returning();

      if (!updated.length) return; // concurrent trigger already handled it

    } else {
      // stop_limit: activate with the original limit price and add to Redis book
      const updated = await db.update(ordersTable).set({
        status: "open",
        updatedAt: new Date(),
      }).where(and(
        eq(ordersTable.id, order.id),
        eq(ordersTable.status, "pending_trigger"),
      )).returning();

      if (!updated.length) return;

      // Insert into Redis ZSET as a resting limit order
      const score = (order.side === "buy" ? -1 : 1) * Number(order.price);
      await rZadd(`orderbook:${pair.symbol}:${order.side}`, score, String(order.id));
      await rSet(`orderbook:${pair.symbol}:order:${order.id}`, JSON.stringify({
        id: order.id, userId: order.userId, side: order.side, type: "limit",
        price: Number(order.price), qty: Number(order.qty), filledQty: 0,
        status: "open", ts: Date.now(),
      }), 86400);
    }

    // Push to matching engine.
    // stop_limit was just added to the Redis ZSET above, so takerInBook=true
    // ensures the engine maintains the ZSET payload inside the locked tx.
    // stop_market never rests in the book, so takerInBook stays false.
    const takerInBook = order.type === "stop_limit";
    await tryMatch(order.id, { takerInBook });

    await rPublish(`orders.${pair.symbol}`, { action: "trigger", order: { id: order.id, type: order.type, side: order.side } });

    logger.info(
      { orderId: order.id, type: order.type, side: order.side, stopPrice: order.stopPrice, currentPrice },
      "Stop order triggered and sent to matching engine",
    );
  } catch (err) {
    logger.warn({ err, orderId: order.id }, "Stop order trigger failed");
  }
}
