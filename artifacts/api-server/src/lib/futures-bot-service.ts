/**
 * futures-bot-service.ts
 *
 * Synthetic liquidity provider for futures pairs.
 * Places market-making limit orders around the index price via the Redis
 * matching engine.  Mirrors the spot bot-service pattern and targets the
 * futures_orders table + Redis engine.
 *
 * Design:
 *   - Leader-gated: only the elected leader places / cancels orders.
 *   - Uses the lowest-id admin/superadmin user as the "bot" user (isBot=1).
 *   - No margin is locked (isBot=1 skips wallet ops in applyFillToPosition).
 *   - Runs every `intervalMs` (default 8 s).
 *   - Cancels stale / wrong-side orders first, then replenishes levels.
 */

import { db, futuresOrdersTable, futuresTradesTable, futuresPositionsTable, marketBotsTable, pairsTable, coinsTable, usersTable } from "@workspace/db";
import { asc, and, eq, inArray, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getRawTick } from "./price-service";
import { rPublish } from "./redis";
import { applyFills, type ResolvedPair } from "../routes/futures";
import { futurePlaceOrder, futuresCancelOrder, futuresSeedOrderbook } from "./futures-matching-engine";

// ── Price helpers ────────────────────────────────────────────────────────────
function indexPrice(baseSymbol: string, quoteSymbol: string): number {
  const bTick = getRawTick(baseSymbol);
  if (!bTick || bTick.usdt <= 0) return 0;
  const q = quoteSymbol.toUpperCase();
  if (q === "USDT") return bTick.usdt;
  if (q === "INR")  return bTick.inr;
  const qTick = getRawTick(quoteSymbol);
  if (!qTick || qTick.usdt <= 0) return 0;
  return bTick.usdt / qTick.usdt;
}

function roundPrice(price: number): string {
  if (price >= 1_000_000) return price.toFixed(1);
  if (price >= 10_000)    return price.toFixed(2);
  if (price >= 100)       return price.toFixed(3);
  if (price >= 1)         return price.toFixed(4);
  if (price >= 0.001)     return price.toFixed(6);
  return price.toFixed(8);
}

// ── Bot user (lowest-id admin/superadmin) ────────────────────────────────────
let botUserId: number | null = null;

async function getBotUserId(): Promise<number | null> {
  if (botUserId !== null) return botUserId;
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','superadmin')`)
    .orderBy(asc(usersTable.id))
    .limit(1);
  if (!admin) return null;
  botUserId = admin.id;
  return botUserId;
}

// ── Bot constants ─────────────────────────────────────────────────────────────
const FUTURES_LEVERAGE    = 1;          // 1× — simplest for synthetic liquidity
const MAX_ORDER_AGE_MS    = 15_000;     // cancel orders older than 15 s — keeps spread tight

// ── Fill-on-cross: fill user limit orders when index price crosses them ────────
//
// Every bot tick, scan all open non-bot limit futures orders for the pair.
// If the current index price has crossed a user's limit price (mid ≤ bid price
// for BUY orders, mid ≥ ask price for SELL orders), the order is executable.
// We fill it completely — regardless of size — by placing a matching bot
// market order on the opposite side through the Redis engine, then calling
// applyFills() to settle positions + wallets exactly as the live route does.
async function fillCrossedUserOrders(
  botId:       number,
  botUserId:   number,
  pairId:      number,
  pair:        ResolvedPair,
  mid:         number,
): Promise<number> {
  // Find all open / partial non-bot limit orders where mid has crossed.
  const openUserOrders = await db
    .select()
    .from(futuresOrdersTable)
    .where(and(
      eq(futuresOrdersTable.pairId,  pairId),
      eq(futuresOrdersTable.isBot,   0),
      eq(futuresOrdersTable.type,    "limit"),
      or(
        eq(futuresOrdersTable.status, "OPEN"),
        eq(futuresOrdersTable.status, "PARTIAL"),
      )!,
    ));

  let filledCount = 0;

  for (const order of openUserOrders) {
    const limitPx  = Number(order.price ?? 0);
    if (!(limitPx > 0)) continue;

    // Execution condition:
    //   BUY  limit → fill when mid ≤ limitPx  (market fell to/below the bid)
    //   SELL limit → fill when mid ≥ limitPx  (market rose to/above the ask)
    const crossed =
      (order.side === "buy"  && mid <= limitPx) ||
      (order.side === "sell" && mid >= limitPx);
    if (!crossed) continue;

    const remaining = Math.max(0, Number(order.qty) - Number(order.filledQty ?? 0));
    if (remaining < 1e-8) continue;

    const fillSide: "buy" | "sell" = order.side === "buy" ? "sell" : "buy";

    try {
      // 1. Insert a bot market order on the opposite side sized to the full
      //    remaining qty.  isBot=1 → applyFills skips wallet/position ops for
      //    the bot, but applies them correctly for the user (maker side).
      const [botOrder] = await db.insert(futuresOrdersTable).values({
        userId:      botUserId,
        pairId,
        side:        fillSide,
        type:        "market",
        price:       String(limitPx.toFixed(8)), // price cap at limit px
        qty:         String(remaining.toFixed(8)),
        filledQty:   "0",
        avgFillPrice:"0",
        leverage:    FUTURES_LEVERAGE,
        marginType:  "isolated",
        marginLocked:"0",
        reduceOnly:  false,
        status:      "OPEN",
        fee:         "0",
        isBot:       1,
      }).returning();

      // 2. Submit to the Redis matching engine. It matches the bot market order
      //    against the user's resting limit order (different userIds → no self-trade block).
      const match = await futurePlaceOrder({
        orderId: botOrder.id,
        userId:  botUserId,
        pairId,
        side:    fillSide,
        type:    "market",
        price:   limitPx,
        qty:     remaining,
        isBot:   true,
      });

      if (match?.trades?.length > 0) {
        // 3. Apply fills: creates/updates user position + settles wallets.
        //    Bot side is no-op (isBot=1 in trade records).
        await applyFills(botOrder, match, pair);
        filledCount++;
        logger.info({
          botId, pairId,
          userOrderId: order.id,
          userId:      order.userId,
          side:        order.side,
          limitPx,
          remaining:   remaining.toFixed(8),
          fills:       match.trades.length,
        }, "futures-bot: filled crossed user order (fill-on-cross)");
      } else {
        // Engine found no resting counterpart — re-seed this order into Redis
        // (may have been lost after a restart) and retry on the next tick.
        try {
          await futuresSeedOrderbook(pairId, [{
            id:     order.id,
            userId: order.userId,
            side:   order.side,
            price:  limitPx,
            qty:    remaining,
            isBot:  false,
          }]);
        } catch { /* best-effort */ }

        await db.update(futuresOrdersTable)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(eq(futuresOrdersTable.id, botOrder.id));

        logger.warn({ botId, pairId, userOrderId: order.id, mid, limitPx },
          "futures-bot: fill-on-cross — engine returned no trades; seeded & will retry");
      }
    } catch (err: any) {
      logger.warn({ botId, pairId, orderId: order.id, err: err?.message },
        "futures-bot: fillCrossedUserOrders failed for order");
    }
  }

  return filledCount;
}

// ── Per-pair bot tick ─────────────────────────────────────────────────────────
async function runFuturesBotForPair(bot: any, userId: number): Promise<void> {
  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, bot.pairId));
  if (!pair) return;

  const [baseCoin]  = await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.baseCoinId)).limit(1);
  const [quoteCoin] = await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)).limit(1);
  if (!baseCoin || !quoteCoin) return;

  const mid = indexPrice(baseCoin.symbol, quoteCoin.symbol);
  if (!(mid > 0)) {
    logger.warn({ botId: bot.id, base: baseCoin.symbol, quote: quoteCoin.symbol }, "futures-bot: index price unavailable");
    return;
  }

  const pairId = Number(pair.id);

  // ── 1. Cancel stale orders ──────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - Math.max(MAX_ORDER_AGE_MS, Number(bot.maxOrderAgeSec ?? 60) * 1000));
  const stale = await db
    .select({ id: futuresOrdersTable.id, side: futuresOrdersTable.side })
    .from(futuresOrdersTable)
    .where(and(
      eq(futuresOrdersTable.userId, userId),
      eq(futuresOrdersTable.isBot, 1),
      eq(futuresOrdersTable.pairId, pairId),
      eq(futuresOrdersTable.status, "OPEN"),
      sql`${futuresOrdersTable.createdAt} < ${cutoff}`,
    ));

  if (stale.length) {
    await db.update(futuresOrdersTable)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(
        eq(futuresOrdersTable.isBot, 1),
        eq(futuresOrdersTable.pairId, pairId),
        inArray(futuresOrdersTable.id, stale.map(o => o.id)),
      ));
    for (const o of stale) {
      await futuresCancelOrder(pairId, o.id).catch(() => {});
    }
    logger.info({ botId: bot.id, pairId, count: stale.length }, "futures-bot: cancelled stale");
  }

  // ── 2. Cancel wrong-side orders (price crossed mid) ────────────────────────
  const live = await db
    .select({ id: futuresOrdersTable.id, side: futuresOrdersTable.side, price: futuresOrdersTable.price })
    .from(futuresOrdersTable)
    .where(and(
      eq(futuresOrdersTable.userId, userId),
      eq(futuresOrdersTable.isBot, 1),
      eq(futuresOrdersTable.pairId, pairId),
      eq(futuresOrdersTable.status, "OPEN"),
    ));

  const wrongSide = live.filter(o => {
    const px = Number(o.price);
    return (o.side === "buy" && px >= mid) || (o.side === "sell" && px <= mid);
  });

  if (wrongSide.length) {
    await db.update(futuresOrdersTable)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(inArray(futuresOrdersTable.id, wrongSide.map(o => o.id)));
    for (const o of wrongSide) {
      await futuresCancelOrder(pairId, o.id).catch(() => {});
    }
    logger.info({ botId: bot.id, pairId, count: wrongSide.length, mid }, "futures-bot: cancelled wrong-side");
  }

  // ── 2.5. Fill-on-cross: fill user limit orders where index crossed price ─────
  // Build the ResolvedPair object needed by applyFills so it can settle
  // positions and wallets exactly the same way the live order route does.
  const resolvedPair: ResolvedPair = {
    id:             pairId,
    baseSymbol:     baseCoin.symbol,
    quoteSymbol:    quoteCoin.symbol,
    baseCoinId:     Number(pair.baseCoinId),
    quoteCoinId:    Number(pair.quoteCoinId),
    pricePrecision: Number(pair.pricePrecision ?? 2),
    qtyPrecision:   Number(pair.qtyPrecision   ?? 4),
    minQty:         Number(pair.minQty         ?? 0),
    maxLeverage:    Number(pair.maxLeverage    ?? 100),
    mmRate:         Number(pair.mmRate         ?? 0.005),
    takerFeeRate:   Number(pair.takerFee        ?? 0.0006),
    makerFeeRate:   Number(pair.makerFee        ?? 0.0002),
    futuresEnabled: Boolean(pair.futuresEnabled),
    futuresStartAt: pair.futuresStartAt ?? null,
    lastPrice:      Number(pair.lastPrice      ?? 0),
  };
  await fillCrossedUserOrders(bot.id, userId, pairId, resolvedPair, mid);

  // ── 3. Replenish book levels ────────────────────────────────────────────────
  const cancelledIds = new Set([...stale.map(o => o.id), ...wrongSide.map(o => o.id)]);
  const remaining    = live.filter(o => !cancelledIds.has(o.id));

  // Bot config (spreadBps and priceStepBps are stored in sub-bps units: 1/1_000_000)
  const targetLevels   = Number(bot.levels ?? 5);
  const rawBaseSize    = Number(bot.orderSize ?? 0.01);
  const halfSpread     = (Number(bot.spreadBps ?? 20) / 2_000_000);
  const stepFrac       = (Number(bot.priceStepBps ?? 10) / 1_000_000);

  // ── Position-based volume boost ─────────────────────────────────────────────
  // When real user positions are open in this pair, the order book should
  // show significantly higher depth/volume so the market looks active and
  // liquid.  Boost is proportional to total open position size.
  const openPositions = await db
    .select({ qty: futuresPositionsTable.qty })
    .from(futuresPositionsTable)
    .where(and(
      eq(futuresPositionsTable.pairId, pairId),
      eq(futuresPositionsTable.status, "open"),
      sql`${futuresPositionsTable.userId} != ${userId}`, // exclude bot user
    ));

  const totalOpenQty   = openPositions.reduce((s, p) => s + Math.abs(Number(p.qty ?? 0)), 0);
  const hasPositions   = openPositions.length > 0;

  // Boost multiplier: 1× when no positions, up to 6× when large positions open.
  // Formula: 2× base + 1× for each position-size increment above base.
  const rawBoost   = hasPositions ? Math.max(2, 1 + totalOpenQty / Math.max(rawBaseSize, 0.0001)) : 1;
  const sizeBoost  = Math.min(rawBoost, 6);
  const baseSize   = rawBaseSize * sizeBoost;

  // More stacked orders per level when positions exist → richer book depth.
  // Number of stacked orders to maintain at each price level.
  // Multiple orders per level create realistic depth (like a real exchange book).
  const ORDERS_PER_LEVEL = hasPositions ? 5 : 3;

  if (hasPositions) {
    logger.info({ botId: bot.id, pairId, openCount: openPositions.length, totalOpenQty: totalOpenQty.toFixed(4), sizeBoost: sizeBoost.toFixed(2), ORDERS_PER_LEVEL },
      "futures-bot: position-based volume boost active");
  }

  // Helper: count existing bot orders at a given target price (within 0.05% tolerance).
  const countAtLevel = (side: "buy" | "sell", targetPx: number): number =>
    remaining.filter(o =>
      o.side === side && Math.abs(Number(o.price ?? 0) / targetPx - 1) < 0.0005,
    ).length;

  const toPlace: Array<{ side: "buy" | "sell"; price: string; qty: string }> = [];

  for (let i = 0; i < targetLevels; i++) {
    const px  = mid * (1 - halfSpread - stepFrac * i);
    if (px <= 0) continue;
    const existing = countAtLevel("buy", px);
    for (let j = existing; j < ORDERS_PER_LEVEL; j++) {
      // Vary quantity between stacked orders for a realistic depth profile.
      const qty = Math.max(0.0001, baseSize * Math.exp(-i * 0.2) * (0.6 + Math.random() * 0.8));
      toPlace.push({ side: "buy", price: roundPrice(px), qty: qty.toFixed(8) });
    }
  }
  for (let i = 0; i < targetLevels; i++) {
    const px  = mid * (1 + halfSpread + stepFrac * i);
    const existing = countAtLevel("sell", px);
    for (let j = existing; j < ORDERS_PER_LEVEL; j++) {
      const qty = Math.max(0.0001, baseSize * Math.exp(-i * 0.2) * (0.6 + Math.random() * 0.8));
      toPlace.push({ side: "sell", price: roundPrice(px), qty: qty.toFixed(8) });
    }
  }

  let placed = 0;
  for (const o of toPlace) {
    try {
      const [row] = await db.insert(futuresOrdersTable).values({
        userId,
        pairId,
        side: o.side,
        type: "limit",
        price: o.price,
        qty: o.qty,
        leverage: FUTURES_LEVERAGE,
        marginType: "isolated",
        marginLocked: "0",
        reduceOnly: false,
        status: "OPEN",
        fee: "0",
        isBot: 1,
      }).returning({ id: futuresOrdersTable.id });

      await futurePlaceOrder({
        orderId: row.id,
        userId,
        pairId,
        side: o.side,
        type: "limit",
        price: Number(o.price),
        qty: Number(o.qty),
        isBot: true,
      });

      placed++;
    } catch (err: any) {
      logger.warn({ botId: bot.id, pairId, side: o.side, err: err?.message }, "futures-bot: place failed");
    }
  }

  if (placed > 0) {
    logger.info({ botId: bot.id, pairId, placed, mid }, "futures-bot: placed orders");
  }

  // Fire occasional market order to generate actual trade history.
  await maybeFireMarketTaker(bot, userId, pairId, baseCoin.symbol, quoteCoin.symbol, mid);
}

// ── Market-taker for trade-history generation ─────────────────────────────────
// Every ~5s, inserts 1-3 synthetic futures_trades rows for the pair so the
// "Recent Trades" panel shows high-frequency live data.
//
// Self-trade prevention means a bot user cannot take from its own resting
// limit orders via the engine. We bypass it and insert trade records directly.
// Fill price comes from resting bot limit orders, keeping it realistic.
const TAKER_INTERVAL_MS = 5_000;
const takerLastFired   = new Map<number, number>(); // pairId → timestamp

async function fireSyntheticTrade(
  userId:   number,
  pairId:   number,
  baseSym:  string,
  quoteSym: string,
  mid:      number,
  orderSize: number,
  side:     "buy" | "sell",
): Promise<void> {
  const makerSide: "buy" | "sell" = side === "buy" ? "sell" : "buy";

  // Use a resting bot limit order on the opposite side as the "maker".
  const [makerOrder] = await db
    .select({ id: futuresOrdersTable.id, price: futuresOrdersTable.price })
    .from(futuresOrdersTable)
    .where(and(
      eq(futuresOrdersTable.pairId,  pairId),
      eq(futuresOrdersTable.isBot,   1),
      eq(futuresOrdersTable.status,  "OPEN"),
      eq(futuresOrdersTable.side,    makerSide),
    ))
    .limit(1);

  if (!makerOrder) return; // No resting liquidity yet — skip.

  // Add tiny random noise to fill price for realism.
  const basePx   = Number(makerOrder.price) > 0 ? Number(makerOrder.price) : mid;
  const noise    = basePx * (Math.random() * 0.00004 - 0.00002); // ±0.002%
  const fillPrice = Math.max(0.000001, basePx + noise);

  // Random qty variation around orderSize.
  const qty = Math.max(0.0001, orderSize * (0.3 + Math.random() * 1.4));

  const [takerRow] = await db.insert(futuresOrdersTable).values({
    userId,
    pairId,
    side,
    type:         "market",
    price:        String(fillPrice.toFixed(8)),
    qty:          qty.toFixed(8),
    filledQty:    qty.toFixed(8),
    avgFillPrice: String(fillPrice.toFixed(8)),
    leverage:     FUTURES_LEVERAGE,
    marginType:   "isolated",
    marginLocked: "0",
    reduceOnly:   false,
    status:       "FILLED",
    fee:          "0",
    isBot:        1,
  }).returning({ id: futuresOrdersTable.id });

  await db.insert(futuresTradesTable).values({
    pairId,
    takerOrderId: takerRow.id,
    makerOrderId: makerOrder.id,
    takerUserId:  userId,
    makerUserId:  userId,
    takerSide:    side,
    price:        String(fillPrice.toFixed(8)),
    qty:          qty.toFixed(8),
    takerFee:     "0",
    makerFee:     "0",
  });

  rPublish(`trades.${baseSym}/${quoteSym}`, {
    price: fillPrice,
    qty,
    side,
    ts:   Date.now(),
  }).catch(() => null);
}

async function maybeFireMarketTaker(
  bot:     any,
  userId:  number,
  pairId:  number,
  baseSym: string,
  quoteSym: string,
  mid:     number,
): Promise<void> {
  const last = takerLastFired.get(pairId) ?? 0;
  if (Date.now() - last < TAKER_INTERVAL_MS) return;
  takerLastFired.set(pairId, Date.now());

  const orderSize = Math.max(0.0001, Number(bot.orderSize ?? 0.01) * 0.4);

  // Fire 2–4 rapid trades per interval — burst effect like real markets.
  const burstCount = 2 + Math.floor(Math.random() * 3); // 2, 3, or 4
  for (let i = 0; i < burstCount; i++) {
    // Alternate sides with slight buy bias (55% buys).
    const side: "buy" | "sell" = Math.random() < 0.55 ? "buy" : "sell";
    try {
      await fireSyntheticTrade(userId, pairId, baseSym, quoteSym, mid, orderSize, side);
    } catch (err: any) {
      logger.warn({ pairId, i, err: err?.message }, "futures-bot-taker: trade insert failed");
    }
  }

  logger.info({ pairId, burstCount }, "futures-bot-taker: burst trades inserted");
}

// ── Service loop ──────────────────────────────────────────────────────────────
let started = false;
let ticking  = false;

async function tick(): Promise<void> {
  const { isLeader } = await import("./leader");
  if (ticking || !isLeader()) return;
  ticking = true;
  try {
    const uid = await getBotUserId();
    if (!uid) return;

    const bots = await db
      .select()
      .from(marketBotsTable)
      .where(and(
        eq(marketBotsTable.futuresEnabled, true),
        eq(marketBotsTable.enabled, true),
      ));

    for (const bot of bots) {
      try {
        await runFuturesBotForPair(bot, uid);
      } catch (err: any) {
        logger.warn({ botId: bot.id, err: err?.message }, "futures-bot: pair tick failed");
      }
    }
  } finally {
    ticking = false;
  }
}

export function startFuturesBotService(intervalMs = 4000): void {
  if (started) return;
  started = true;
  // 6 s startup delay — let price feeds + Redis engine initialise first.
  setTimeout(() => {
    void tick().catch(() => null);
    setInterval(() => { void tick().catch(() => null); }, intervalMs);
  }, 6000);
  logger.info({ intervalMs }, "futures-bot: service started (leader-gated)");
}
