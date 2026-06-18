import { db, marketBotsTable, ordersTable, pairsTable, coinsTable, usersTable } from "@workspace/db";
import { asc, and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getRawTick } from "./price-service";
import { rZadd, rZrem, rSet, rDel, rPublish, getRedis } from "./redis";
import { tryMatch } from "./matching-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Redis orderbook helpers
// ─────────────────────────────────────────────────────────────────────────────
async function bookAdd(symbol: string, o: any) {
  if (o.status !== "open" || o.type !== "limit") return;
  const score = (o.side === "buy" ? -1 : 1) * Number(o.price);
  const member = JSON.stringify({
    id: o.id, userId: o.userId, side: o.side, type: o.type,
    price: Number(o.price), qty: Number(o.qty), filledQty: Number(o.filledQty ?? 0),
    status: o.status, ts: Date.now(), bot: true,
  });
  await rZadd(`orderbook:${symbol}:${o.side}`, score, String(o.id));
  await rSet(`orderbook:${symbol}:order:${o.id}`, member, 86400);
  await rPublish(`orders.${symbol}`, { action: "new", order: JSON.parse(member) });
}

async function bookRemove(
  symbol: string,
  o: { id: number; side: string; userId?: number; price?: any; qty?: any; type?: string; filledQty?: any; status?: string },
  action: "cancel" | "fill" = "cancel",
) {
  await rZrem(`orderbook:${symbol}:${o.side}`, String(o.id));
  await rDel(`orderbook:${symbol}:order:${o.id}`);
  const payload = {
    action,
    order: {
      id: o.id, userId: o.userId, side: o.side, type: o.type ?? "limit",
      price: Number(o.price ?? 0), qty: Number(o.qty ?? 0),
      filledQty: Number(o.filledQty ?? 0), status: o.status ?? action,
      ts: Date.now(), bot: true,
    },
  };
  await rPublish(`orders.${symbol}`, payload);
}

// Scan the Redis orderbook between fromPrice and toPrice and return the total
// remaining quantity at those levels. Used to size chase market orders so they
// sweep exactly up to the current reference price — no more, no less.
async function calcSweepQty(symbol: string, takerSide: "buy" | "sell", fromPrice: number, toPrice: number): Promise<number> {
  const r = getRedis();
  if (!r) return 0;
  const bookSide = takerSide === "buy" ? "sell" : "buy";
  const lo = Math.min(fromPrice, toPrice);
  const hi = Math.max(fromPrice, toPrice);
  // Sell orders: score = +price (ascending). Buy orders: score = -price.
  const scoreMin = bookSide === "sell" ? lo : -hi;
  const scoreMax = bookSide === "sell" ? hi : -lo;
  const ids = await r.zrangebyscore(`orderbook:${symbol}:${bookSide}`, scoreMin, scoreMax);
  if (ids.length === 0) return 0;
  let total = 0;
  for (const id of ids) {
    const raw = await r.get(`orderbook:${symbol}:order:${id}`);
    if (!raw) continue;
    try {
      const o = JSON.parse(raw);
      total += Math.max(0, Number(o.qty) - Number(o.filledQty ?? 0));
    } catch { /* skip malformed */ }
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot user
// ─────────────────────────────────────────────────────────────────────────────
let started = false;
let ticking = false;
let botUserId: number | null = null;

async function getBotUserId(): Promise<number | null> {
  if (botUserId) return botUserId;
  // Order by id ASC so the same (lowest-id) admin is always selected
  // across restarts, regardless of table or index scan order.
  const admins = await db.select().from(usersTable)
    .where(sql`${usersTable.role} IN ('admin','superadmin')`)
    .orderBy(asc(usersTable.id))
    .limit(1);
  if (!admins[0]) return null;
  botUserId = admins[0].id;
  return botUserId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Index price  (external feed — never from pair.lastPrice)
// ─────────────────────────────────────────────────────────────────────────────
function indexPriceForPair(pair: { _baseSymbol: string; _quoteSymbol: string }): number {
  const bTick = getRawTick(pair._baseSymbol);
  if (!bTick || bTick.usdt <= 0) return 0;
  const q = pair._quoteSymbol.toUpperCase();
  if (q === "INR")  return bTick.inr;
  if (q === "USDT") return bTick.usdt;
  const qTick = getRawTick(pair._quoteSymbol);
  if (!qTick || qTick.usdt <= 0) return 0;
  return bTick.usdt / qTick.usdt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Price rounding to tick-size precision
// ─────────────────────────────────────────────────────────────────────────────
function roundPrice(price: number): string {
  if (price >= 1_000_000) return price.toFixed(1);
  if (price >= 10_000)    return price.toFixed(2);
  if (price >= 100)       return price.toFixed(3);
  if (price >= 1)         return price.toFixed(4);
  if (price >= 0.001)     return price.toFixed(6);
  return price.toFixed(8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic spread multiplier — widen during volatile moves
// ─────────────────────────────────────────────────────────────────────────────
function dynamicSpreadMult(currentMid: number, lastMid: number): number {
  if (lastMid <= 0) return 1;
  const moveBps = Math.abs(currentMid - lastMid) / lastMid * 10_000;
  // Tight spread policy: max 1.15× even during volatile moves so the book
  // always shows a competitive, exchange-grade spread.
  if (moveBps < 15)  return 1.0;
  if (moveBps < 50)  return 1.07;
  if (moveBps < 120) return 1.12;
  return 1.15;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONAL ORDER SIZING ENGINE
//
// Three-axis model:
//   1. Exponential depth taper  — level 0 (best bid/ask) gets full size,
//      each step away decays by ~30% → realistic "wall near mid, thin at edges"
//
//   2. Momentum scaling         — when price is trending up, buy orders grow
//      (up to 3× baseSize); sell orders shrink. Reversed for downtrend.
//      This simulates real market-maker behaviour: lean into momentum.
//
//   3. Top-of-book boost        — configurable extra size at level 0 to
//      ensure the best quote is always the most liquid (prevents thin top).
//
//   4. Organic jitter ±12%      — each individual order varies slightly so
//      the book doesn't look mechanical / bot-generated.
// ─────────────────────────────────────────────────────────────────────────────
function sizeForLevel(
  i: number,
  side: "buy" | "sell",
  momentumBps: number,
  baseSize: number,
  boostMult: number,
): number {
  // 1. Exponential taper: volume highest at top (i=0), falling as we go deeper
  const DECAY = 0.28;
  const depthScale = Math.exp(-i * DECAY);

  // 2. Momentum scaling
  //    momentumBps > 0 → price moving up (bullish)
  //    momentumBps < 0 → price moving down (bearish)
  let momentumScale = 1.0;
  const absMom = Math.abs(momentumBps);
  if (absMom > 5) {
    const strength = Math.min(absMom / 120, 2.2); // 0..2.2 normalised strength
    if (momentumBps > 0) {
      // Bullish: buy orders grow, sell orders shrink
      if (side === "buy")  momentumScale = 1 + strength;          // up to 3.2×
      else                 momentumScale = Math.max(0.35, 1 - strength * 0.28);
    } else {
      // Bearish: sell orders grow, buy orders shrink
      if (side === "sell") momentumScale = 1 + strength;
      else                 momentumScale = Math.max(0.35, 1 - strength * 0.28);
    }
  }

  // 3. Top-of-book boost (only for level 0)
  const topBoost = i === 0 ? boostMult : 1.0;

  // 4. Organic jitter ±12%
  const jitter = 0.88 + Math.random() * 0.24;

  return baseSize * depthScale * momentumScale * topBoost * jitter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic level count
//
// When there is strong momentum, the bot pushes extra levels on the
// "with-momentum" side to simulate real participant behaviour — a rallying
// market generates deeper bids, a falling market generates deeper asks.
// ─────────────────────────────────────────────────────────────────────────────
function levelsForSide(
  side: "buy" | "sell",
  baseLevels: number,
  momentumBps: number,
): number {
  const absMom = Math.abs(momentumBps);
  if (absMom < 15) return baseLevels;
  const extra = absMom < 40 ? 1 : absMom < 100 ? 2 : 3;
  if (momentumBps > 0 && side === "buy")  return baseLevels + extra;
  if (momentumBps < 0 && side === "sell") return baseLevels + extra;
  return baseLevels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main per-pair bot run
// ─────────────────────────────────────────────────────────────────────────────
async function runBotForPair(bot: any, uid: number) {
  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, bot.pairId));
  if (!pair) return;
  const baseCoin = (await db.select().from(coinsTable).where(eq(coinsTable.id, pair.baseCoinId)))[0];
  const quoteCoin = (await db.select().from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)))[0];
  if (!baseCoin || !quoteCoin) return;

  const enriched = { ...pair, _baseSymbol: baseCoin.symbol, _quoteSymbol: quoteCoin.symbol };
  const mid = indexPriceForPair(enriched);
  if (!(mid > 0)) {
    await db.update(marketBotsTable).set({
      status: "no_price",
      lastError: `index price unavailable for ${baseCoin.symbol}/${quoteCoin.symbol}`,
      lastRunAt: new Date(),
    }).where(eq(marketBotsTable.id, bot.id));
    return;
  }

  const lastMid = bot.lastMidPrice ? Number(bot.lastMidPrice) : 0;
  const spreadMult = dynamicSpreadMult(mid, lastMid);

  // Momentum in basis points (positive = bullish, negative = bearish)
  const momentumBps = lastMid > 0 ? ((mid - lastMid) / lastMid) * 10_000 : 0;

  // ── 1. Cancel stale orders ──────────────────────────────────────────────
  const ageMs = bot.maxOrderAgeSec * 1000;
  const cutoff = new Date(Date.now() - ageMs);
  const stale = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id),
    eq(ordersTable.status, "open"),
    sql`${ordersTable.createdAt} < ${cutoff}`,
  ));
  if (stale.length) {
    await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(ordersTable.botId, bot.id),
      eq(ordersTable.status, "open"),
      sql`${ordersTable.createdAt} < ${cutoff}`,
    ));
    for (const s of stale) {
      try { await bookRemove(pair.symbol, s as any, "cancel"); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: s.id }, "bot: stale remove failed");
      }
    }
  }

  // ── 2. Cancel wrong-side AND out-of-range orders ────────────────────────
  // "Wrong-side": a BUY whose price crossed above mid, or a SELL that crossed below mid.
  // "Out-of-range": a BUY so far below mid (or SELL so far above mid) that it can never
  //   be reached by normal price action — these block the replenishment quota and prevent
  //   the bot from placing fresh orders at the correct prices near mid.
  //   Out-of-range threshold: 2× the full spread width beyond the outermost intended level.
  const targetBuysForRange  = levelsForSide("buy",  bot.levels, momentumBps);
  const targetSellsForRange = levelsForSide("sell", bot.levels, momentumBps);
  // Compute spread/step inline here so we can use them before the replenishment block below.
  const _stepFrac2   = bot.priceStepBps / 1_000_000;
  const _halfSpread2 = (bot.spreadBps   / 2_000_000) * spreadMult;
  const outerBuyFloor  = mid * (1 - _halfSpread2 - _stepFrac2 * targetBuysForRange  - 2 * (_halfSpread2 + _stepFrac2));
  const outerSellCeil  = mid * (1 + _halfSpread2 + _stepFrac2 * targetSellsForRange + 2 * (_halfSpread2 + _stepFrac2));

  const liveBot = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id),
    eq(ordersTable.status, "open"),
  ));
  const wrongSide = liveBot.filter(o => {
    const px = Number(o.price);
    if (o.side === "buy")  return px >= mid || px < outerBuyFloor;
    if (o.side === "sell") return px <= mid || px > outerSellCeil;
    return false;
  });
  if (wrongSide.length) {
    const ids = wrongSide.map(o => o.id);
    await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(
      eq(ordersTable.botId, bot.id),
      eq(ordersTable.status, "open"),
      inArray(ordersTable.id, ids),
    ));
    for (const o of wrongSide) {
      try { await bookRemove(pair.symbol, o as any, "cancel"); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: wrong-side remove failed");
      }
    }
    logger.info({ botId: bot.id, symbol: pair.symbol, count: wrongSide.length, mid, momentumBps, outerBuyFloor: outerBuyFloor.toFixed(4), outerSellCeil: outerSellCeil.toFixed(4) }, "bot: cancelled wrong-side/out-of-range quotes");
  }

  // ── 3. Replenish orderbook with momentum-scaled, depth-tapered orders ──
  // (fillOnCross runs AFTER replenishment in step 4 so the book has fresh
  //  bids/asks at the correct prices before we try to match user orders.)
  const existing = await db.select().from(ordersTable).where(and(
    eq(ordersTable.botId, bot.id), eq(ordersTable.status, "open"),
  ));
  const buyCount  = existing.filter(o => o.side === "buy").length;
  const sellCount = existing.filter(o => o.side === "sell").length;

  // spreadBps and priceStepBps are stored in units of 0.0001 bps (100× finer
  // than traditional bps) so that integer columns can represent sub-dollar
  // spreads. e.g. spreadBps=10 → halfSpread=0.0005% → $0.95 on BTC at $95k.
  const stepFrac   = bot.priceStepBps / 1_000_000;
  const halfSpread = (bot.spreadBps   / 2_000_000) * spreadMult;
  const baseSize   = Number(bot.orderSize);
  const boostMult  = 1 + (Number(bot.topOfBookBoostPct ?? 0) / 100);

  // Dynamic level count — more levels on momentum side
  const targetBuys  = levelsForSide("buy",  bot.levels, momentumBps);
  const targetSells = levelsForSide("sell", bot.levels, momentumBps);

  const newOrders: any[] = [];

  // BUY levels — highest volume at level 0 (closest to mid), tapering down
  for (let i = buyCount; i < targetBuys; i++) {
    const px = mid * (1 - halfSpread - stepFrac * i);
    if (px <= 0) continue;
    const qty = sizeForLevel(i, "buy", momentumBps, baseSize, boostMult);
    newOrders.push({
      userId: uid, pairId: pair.id, side: "buy", type: "limit",
      price: roundPrice(px),
      qty: String(Math.max(0.0001, qty).toFixed(8)),
      status: "open", isBot: 1, botId: bot.id,
    });
  }

  // SELL levels — same taper logic, momentum-scaled
  for (let i = sellCount; i < targetSells; i++) {
    const px = mid * (1 + halfSpread + stepFrac * i);
    const qty = sizeForLevel(i, "sell", momentumBps, baseSize, boostMult);
    newOrders.push({
      userId: uid, pairId: pair.id, side: "sell", type: "limit",
      price: roundPrice(px),
      qty: String(Math.max(0.0001, qty).toFixed(8)),
      status: "open", isBot: 1, botId: bot.id,
    });
  }

  if (newOrders.length) {
    const inserted = await db.insert(ordersTable).values(newOrders).returning();
    for (const o of inserted) {
      try { await bookAdd(pair.symbol, o); } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: bookAdd failed");
      }
      try {
        await tryMatch(o.id, { takerInBook: true });
      } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: tryMatch on new quote failed");
      }
    }
  }

  // ── 4. Re-match open user orders that cross the new mid ─────────────────
  // Runs AFTER replenishment so the book has fresh bids/asks at the correct
  // prices. Previously this ran before replenishment, so it would fail when
  // old bot orders were too far from mid and no bids existed at the user's
  // sell price even though the market had moved above it.
  if (bot.fillOnCross) {
    const openUser = await db.select().from(ordersTable).where(and(
      eq(ordersTable.pairId, pair.id),
      eq(ordersTable.status, "open"),
      eq(ordersTable.isBot, 0),
    ));
    for (const o of openUser) {
      const px = Number(o.price);
      const crosses = (o.side === "buy" && mid <= px) || (o.side === "sell" && mid >= px);
      if (!crosses) continue;
      try {
        const [u] = await db.select({ vipTier: usersTable.vipTier })
          .from(usersTable).where(eq(usersTable.id, o.userId)).limit(1);
        await tryMatch(o.id, { takerVipTier: Number(u?.vipTier ?? 0), takerInBook: true });
      } catch (e: any) {
        logger.warn({ err: e?.message, orderId: o.id }, "bot: tryMatch on cross failed");
      }
    }
  }

  // ── 5. MARKET-TAKER — momentum-scaled synthetic fills ──────────────────
  //
  // Enhanced logic:
  //   (a) Big-order absorption: unchanged
  //   (b) Price-move chase: qty now scales with momentum STRENGTH, not fixed
  //   (c) Momentum burst: when momentum is very strong (>100 bps), fire an
  //       extra oversized burst order to simulate institutional buying
  // ─────────────────────────────────────────────────────────────────────────
  let marketReason: string | null = null;
  let marketSide: "buy" | "sell" | null = null;
  let marketQty = 0;

  if (bot.marketTakerEnabled) {
    const cooldownMs = bot.marketTakerCooldownSec * 1000;
    const lastMkt    = bot.lastMarketOrderAt ? new Date(bot.lastMarketOrderAt).getTime() : 0;
    const cooledDown = Date.now() - lastMkt >= cooldownMs;

    // (a) Big-order detection
    const bigThreshold = Number(bot.bigOrderTriggerQty ?? 0);
    if (cooledDown && bigThreshold > 0) {
      const opposite = await db.select().from(ordersTable).where(and(
        eq(ordersTable.pairId, pair.id),
        eq(ordersTable.status, "open"),
        eq(ordersTable.isBot, 0),
        sql`(CAST(${ordersTable.qty} AS DECIMAL) - CAST(${ordersTable.filledQty} AS DECIMAL)) >= ${bigThreshold}`,
      )).limit(5);
      if (opposite.length > 0) {
        const biggest = opposite.reduce((a, b) =>
          (Number(a.qty) - Number(a.filledQty)) > (Number(b.qty) - Number(b.filledQty)) ? a : b,
        );
        marketSide = biggest.side === "sell" ? "buy" : "sell";
        marketQty  = baseSize * Number(bot.bigOrderAbsorbMult);
        marketReason = `absorb big ${biggest.side} #${biggest.id} qty=${(Number(biggest.qty) - Number(biggest.filledQty)).toFixed(4)}`;
      }
    }

    // (b) Momentum chase — sweep all book levels between lastMid and mid
    if (!marketSide && cooledDown && lastMid > 0 && bot.priceMoveTriggerBps > 0) {
      const moveBps = Math.abs(mid - lastMid) / lastMid * 10_000;
      if (moveBps >= bot.priceMoveTriggerBps) {
        marketSide = mid > lastMid ? "buy" : "sell";
        // Calculate exact qty to clear all levels between lastMid and mid.
        // Falls back to momentum-scaled estimate if book is empty / Redis unavailable.
        const sweepQty = await calcSweepQty(pair.symbol, marketSide, lastMid, mid);
        const momentumStrength = Math.min(moveBps / bot.priceMoveTriggerBps, 4.0);
        const fallbackQty = baseSize * Number(bot.marketTakerSizeMult) * momentumStrength;
        marketQty = sweepQty > 0 ? sweepQty : fallbackQty;
        marketReason = `chase ${moveBps.toFixed(1)}bps move @${momentumStrength.toFixed(2)}× (${lastMid.toFixed(4)} → ${mid.toFixed(4)})`;
      }
    }

    // (c) Momentum burst — very strong move → oversized institutional-style order
    if (!marketSide && cooledDown && Math.abs(momentumBps) >= 100) {
      marketSide = momentumBps > 0 ? "buy" : "sell";
      marketQty  = baseSize * Number(bot.marketTakerSizeMult) * 3.5;
      marketReason = `momentum burst ${momentumBps.toFixed(1)}bps`;
    }

    // (d) Heartbeat — if no trigger matched but cooldown has elapsed,
    //     emit a small randomised fill to keep the tape alive.
    // This ensures Recent Trades always shows activity even on stable-price
    // pairs where momentum / big-order conditions never fire.
    if (!marketSide && cooledDown) {
      marketSide = Math.random() > 0.5 ? "buy" : "sell";
      marketQty  = baseSize * Number(bot.marketTakerSizeMult) * (0.3 + Math.random() * 0.5);
      marketReason = "heartbeat";
    }

    if (marketSide && marketQty > 0) {
      // Place a real open market order and run it through the matching engine.
      // The trade price comes from actual resting bot limit orders in the book,
      // so the tape always reflects real book prices — never a synthetic mid.
      // The matching engine skips wallet ops when isBot=1, so no ghost balances.
      const priceCap = roundPrice(mid * (marketSide === "buy" ? 1.02 : 0.98));
      const [mktOrder] = await db.insert(ordersTable).values({
        userId: uid, pairId: pair.id, side: marketSide, type: "market",
        price: priceCap, qty: String(marketQty.toFixed(8)),
        filledQty: "0", avgPrice: "0",
        status: "open", isBot: 1, botId: bot.id,
      }).returning();
      // Heartbeat only needs to print 1 trade (top-of-book touch).
      // Chase/burst/bigOrder can sweep multiple levels as intended.
      const result = await tryMatch(mktOrder.id, { maxFills: marketReason === "heartbeat" ? 1 : 200 });
      // Cancel any unfilled or partially-filled remainder — bot market orders
      // should never rest in the book; they sweep and exit.
      if (result.status !== "filled") {
        await db.update(ordersTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(ordersTable.id, mktOrder.id));
      }
      logger.info({ botId: bot.id, symbol: pair.symbol, side: marketSide, qty: marketQty.toFixed(4), reason: marketReason, matched: result.trades }, "bot: fired market order");
    }
  }

  await db.update(marketBotsTable).set({
    status: "running",
    lastError: marketReason ? `market: ${marketReason}` : null,
    lastRunAt: new Date(),
    lastMidPrice: String(mid.toFixed(8)),
    ...(marketSide ? { lastMarketOrderAt: new Date() } : {}),
  }).where(eq(marketBotsTable.id, bot.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tick loop
// ─────────────────────────────────────────────────────────────────────────────
async function tick() {
  const bots = await db.select().from(marketBotsTable).where(eq(marketBotsTable.enabled, true));
  if (!bots.length) return;
  const uid = await getBotUserId();
  if (!uid) { logger.warn("bot: no admin user found, skipping"); return; }

  for (const bot of bots) {
    if (bot.startAt && new Date(bot.startAt).getTime() > Date.now()) {
      await db.update(marketBotsTable).set({ status: "scheduled", lastError: null }).where(eq(marketBotsTable.id, bot.id));
      continue;
    }
    if (!bot.spotEnabled && !bot.futuresEnabled) {
      await db.update(marketBotsTable).set({ status: "disabled", lastError: "neither spot nor futures enabled" }).where(eq(marketBotsTable.id, bot.id));
      continue;
    }
    const last = bot.lastRunAt ? new Date(bot.lastRunAt).getTime() : 0;
    if (Date.now() - last < bot.refreshSec * 1000) continue;
    try { await runBotForPair(bot, uid); }
    catch (e: any) {
      logger.warn({ err: e?.message, botId: bot.id }, "bot tick failed");
      await db.update(marketBotsTable).set({ status: "error", lastError: String(e?.message || e), lastRunAt: new Date() }).where(eq(marketBotsTable.id, bot.id));
    }
  }
}

async function safeTick() {
  const { isLeader } = await import("./leader");
  if (!isLeader()) return;
  if (ticking) return;
  ticking = true;
  try { await tick(); }
  catch (e: any) { logger.warn({ err: e?.message, stack: e?.stack }, "bot tick uncaught"); }
  finally { ticking = false; }
}

// On startup: flush all Redis orderbook keys and cancel all open bot orders
// in the DB so fresh tight-spread orders are placed immediately.
async function flushOrderbookOnStartup() {
  try {
    const redis = getRedis();
    if (redis) {
      // SCAN for all orderbook:* keys and delete in one pass
      let cursor = "0";
      const toDelete: string[] = [];
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", "orderbook:*", "COUNT", 500);
        cursor = next;
        toDelete.push(...keys);
      } while (cursor !== "0");
      if (toDelete.length) {
        await redis.del(...toDelete);
        logger.info({ keys: toDelete.length }, "bot: flushed orderbook Redis keys on startup");
      }
    }

    // Cancel all bot open orders in DB
    const cancelled = await db
      .update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(ordersTable.status, "open"), sql`${ordersTable.botId} IS NOT NULL`))
      .returning({ id: ordersTable.id });
    if (cancelled.length) logger.info({ count: cancelled.length }, "bot: cancelled stale bot orders in DB on startup");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "bot: startup flush failed (non-fatal)");
  }
}

export function startBotService(intervalMs = 3000) {
  if (started) return;
  started = true;
  // Flush Redis orderbook + cancel stale DB orders → fresh tight-spread ones placed immediately
  void flushOrderbookOnStartup();
  setInterval(() => { void safeTick(); }, intervalMs);
  logger.info({ intervalMs }, "bot service started");
}
