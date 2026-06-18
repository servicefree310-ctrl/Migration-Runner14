import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq, and, or, desc, lt, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, ordersTable, tradesTable, pairsTable, walletsTable, coinsTable, usersTable, settingsTable, futuresOrdersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { rZadd, rZrem, rPublish, rLpush, rSet } from "../lib/redis";
import { tryMatch, getDepth, getRecentTrades } from "../lib/matching-engine";
import { getSpotFeeRates, loadFeeSettings } from "./fees";
import { getInrRate } from "../lib/price-service";
import { COMPANY_CIN, COMPANY_GST, COMPANY_PAN, COMPANY_ADDRESS } from "../lib/company";
import { creditTradingFeeReferralChain } from "../lib/trading-fee-referral";
import { triggerCopyTrades } from "../lib/copy-engine";
import { logger } from "../lib/logger";

// ─── Zod schemas ─────────────────────────────────────────────────────────
// Stricter than the historical placeSpotOrder() guard — we validate types &
// finiteness here so a bad client sees a clean 400 instead of a 500 bubbling
// up from the inner engine. .strict() blocks mass-assignment of fields the
// engine doesn't expect (status, userId, fee overrides, etc).
const LIMIT_TYPES = ["limit", "ioc", "fok", "post_only", "stop_limit"] as const;
const MARKET_TYPES = ["market", "stop_market"] as const;
const STOP_TYPES  = ["stop_limit", "stop_market"] as const;

const PlaceOrderBody = z.object({
  pairId:    z.coerce.number().int().positive(),
  side:      z.enum(["buy", "sell"]),
  type:      z.enum(["limit", "market", "ioc", "fok", "post_only", "stop_limit", "stop_market"]),
  qty:       z.coerce.number().finite().positive(),
  price:     z.coerce.number().finite().positive().optional(),
  stopPrice: z.coerce.number().finite().positive().optional(),
}).strict().superRefine((data, ctx) => {
  const needsPrice = (LIMIT_TYPES as readonly string[]).includes(data.type);
  const noPrice    = (MARKET_TYPES as readonly string[]).includes(data.type);
  const needsStop  = (STOP_TYPES as readonly string[]).includes(data.type);
  if (needsPrice && data.price == null)
    ctx.addIssue({ code: "custom", path: ["price"], message: "price required for this order type" });
  if (noPrice && data.price != null)
    ctx.addIssue({ code: "custom", path: ["price"], message: "price not allowed for market orders" });
  if (needsStop && data.stopPrice == null)
    ctx.addIssue({ code: "custom", path: ["stopPrice"], message: "stopPrice required for stop orders" });
});

async function pushOrderToRedis(o: any, pair: any, action: "new" | "cancel" | "fill") {
  const symbol = pair?.symbol ?? `pair-${o.pairId}`;
  const score = (o.side === "buy" ? -1 : 1) * Number(o.price);
  const member = JSON.stringify({ id: o.id, userId: o.userId, side: o.side, type: o.type, price: Number(o.price), qty: Number(o.qty), filledQty: Number(o.filledQty ?? 0), status: o.status, ts: Date.now() });
  if (action === "new" && o.status === "open" && (o.type === "limit" || o.type === "post_only")) {
    await rZadd(`orderbook:${symbol}:${o.side}`, score, String(o.id));
    await rSet(`orderbook:${symbol}:order:${o.id}`, member, 86400);
  }
  if (action === "cancel" || action === "fill") {
    await rZrem(`orderbook:${symbol}:${o.side}`, String(o.id));
  }
  await rLpush(`orders:user:${o.userId}`, member);
  await rPublish(`orders.${symbol}`, { action, order: JSON.parse(member) });
  await rPublish(`orders.user.${o.userId}`, { action, order: JSON.parse(member) });
}

async function pushTradeToRedis(trade: any, pair: any) {
  const symbol = pair?.symbol ?? `pair-${trade.pairId}`;
  const payload = JSON.stringify({ id: trade.id, pairId: trade.pairId, side: trade.side, price: Number(trade.price), qty: Number(trade.qty), fee: Number(trade.fee), userId: trade.userId, ts: Date.now() });
  await rLpush(`trades:${symbol}`, payload);
  await rLpush(`trades:user:${trade.userId}`, payload);
  await rPublish(`trades.${symbol}`, JSON.parse(payload));
}

const router: IRouter = Router();

// ── Redis helpers for advanced order types ────────────────────────────────

/** Returns true if a limit order at `limitPrice` would immediately cross
 *  the current best opposite resting order (used by post_only check). */
async function wouldCrossBook(symbol: string, side: "buy" | "sell", limitPrice: number): Promise<boolean> {
  const { getRedis } = await import("../lib/redis");
  const r = getRedis();
  if (!r) return false;
  const bookSide = side === "buy" ? "sell" : "buy";
  const top = await r.zrange(`orderbook:${symbol}:${bookSide}`, 0, 0, "WITHSCORES");
  if (!top || top.length < 2) return false;
  const score = Number(top[1]);
  const bestOppPrice = bookSide === "sell" ? score : -score;
  return side === "buy" ? limitPrice >= bestOppPrice : limitPrice <= bestOppPrice;
}

/** Returns the total resting qty available on the opposite side at prices
 *  acceptable to this order — used by FOK pre-check. */
async function availableQtyForSide(symbol: string, side: "buy" | "sell", limitPrice: number): Promise<number> {
  const { getRedis } = await import("../lib/redis");
  const r = getRedis();
  if (!r) return 0;
  const bookSide = side === "buy" ? "sell" : "buy";
  const entries = await r.zrange(`orderbook:${symbol}:${bookSide}`, 0, 499, "WITHSCORES");
  if (!entries || entries.length < 2) return 0;
  const keys: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const score = Number(entries[i + 1]);
    const p = bookSide === "sell" ? score : -score;
    if (side === "buy" && p > limitPrice) continue;
    if (side === "sell" && p < limitPrice) continue;
    keys.push(`orderbook:${symbol}:order:${entries[i]}`);
    prices.push(p);
  }
  if (keys.length === 0) return 0;
  const payloads = await r.mget(...keys);
  let total = 0;
  for (const p of payloads) {
    if (!p) continue;
    const o = JSON.parse(p);
    total += Number(o.qty ?? 0) - Number(o.filledQty ?? 0);
  }
  return total;
}

/** Cancel order + refund locked balance. Used when post_only or FOK
 *  pre-checks fail so the lock from the DB transaction is unwound. */
async function cancelOrderAndRefund(order: any, userId: number, pair: any, vipTier: number, quoteWalletType: string): Promise<void> {
  await db.transaction(async (tx) => {
    const fees = await getSpotFeeRates(vipTier);
    if (order.side === "buy") {
      const release = (Number(order.qty) - Number(order.filledQty ?? 0)) * Number(order.price) * (1 + fees.taker);
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, pair.quoteCoinId), eq(walletsTable.walletType, quoteWalletType)))
        .for("update").limit(1);
      if (w) await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${release}`,
        locked: sql`${walletsTable.locked} - ${release}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
    } else {
      const rem = Number(order.qty) - Number(order.filledQty ?? 0);
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, pair.baseCoinId), eq(walletsTable.walletType, "spot")))
        .for("update").limit(1);
      if (w) await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${rem}`,
        locked: sql`${walletsTable.locked} - ${rem}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
    }
    await tx.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
  });
}

async function ensureWallet(tx: any, userId: number, coinId: number, walletType: string) {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
    .for("update").limit(1);
  if (w) return w;
  const [created] = await tx.insert(walletsTable).values({
    userId, coinId, walletType, balance: "0", locked: "0",
  }).returning();
  // Re-lock the just-created row
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, created.id)).for("update").limit(1);
  return locked;
}

// SECURITY: User-facing "My Orders" / "My Trades" must NEVER include bot rows.
// Bot orders are inserted under a real user_id (currently the admin's id) so the
// userId scope alone is not enough to keep them out of a user's personal view —
// without an explicit `is_bot = 0` filter, an admin (or any user that shares an
// id with the bot account) would see all market-making bot orders as if they
// placed them. Bot rows remain visible only via the admin endpoints in admin.ts.
router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const statusQ = (req.query.status as string) || "all";
  // Cursor-based pagination: pass the `cursor` id from the last item of the
  // previous page to fetch the next page (id DESC). Defaults to newest 100.
  const cursorId = req.query.cursor ? Number(req.query.cursor) : null;
  const pageLimit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

  // ── Spot orders ──────────────────────────────────────────────────────────
  const spotConds = [eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)] as any[];
  if (statusQ !== "all") spotConds.push(eq(ordersTable.status, statusQ));
  if (cursorId) spotConds.push(lt(ordersTable.id, cursorId));
  const spotRows = await db.select().from(ordersTable)
    .where(and(...spotConds))
    .orderBy(desc(ordersTable.id))
    .limit(pageLimit);

  // ── Futures orders ───────────────────────────────────────────────────────
  // Mirror the spot status filter so closed futures orders don't bleed into
  // the "Open Orders" panel (futures statuses are uppercase: OPEN/PARTIAL/FILLED/CANCELLED).
  const futConds = [eq(futuresOrdersTable.userId, userId), eq(futuresOrdersTable.isBot, 0)] as any[];
  if (statusQ !== "all") {
    if (statusQ === "open") {
      futConds.push(or(eq(futuresOrdersTable.status, "OPEN"), eq(futuresOrdersTable.status, "PARTIAL"))!);
    } else if (statusQ === "filled") {
      futConds.push(eq(futuresOrdersTable.status, "FILLED"));
    } else if (statusQ === "cancelled") {
      futConds.push(or(eq(futuresOrdersTable.status, "CANCELLED"), eq(futuresOrdersTable.status, "REJECTED"))!);
    }
  }
  if (cursorId) futConds.push(lt(futuresOrdersTable.id, cursorId));
  const futRows = await db.select().from(futuresOrdersTable)
    .where(and(...futConds))
    .orderBy(desc(futuresOrdersTable.id))
    .limit(pageLimit);

  // Resolve pair symbols for futures
  const pairIds = [...new Set(futRows.map(r => r.pairId))];
  const pairSymMap = new Map<number, string>();
  if (pairIds.length > 0) {
    const pairs = await db.select({ id: pairsTable.id, symbol: pairsTable.symbol })
      .from(pairsTable).where(inArray(pairsTable.id, pairIds));
    for (const p of pairs) pairSymMap.set(p.id, p.symbol || "");
  }

  // Normalize futures status to lowercase to match spot conventions
  function normFutStatus(s: string): string {
    const u = s.toUpperCase();
    if (u === "OPEN")      return "open";
    if (u === "PARTIAL")   return "partially_filled";
    if (u === "FILLED")    return "filled";
    if (u === "CANCELLED") return "cancelled";
    if (u === "REJECTED")  return "cancelled";
    return s.toLowerCase();
  }

  const normalizedFut = futRows.map(r => ({
    id: r.id,
    uid: r.uid,
    userId: r.userId,
    pairId: r.pairId,
    symbol: (pairSymMap.get(r.pairId) || "").replace("/", "") + "-PERP",
    side: r.side,
    type: r.type,
    price: r.price ? String(r.price) : null,
    avgPrice: r.avgFillPrice ? String(r.avgFillPrice) : null,
    qty: String(r.qty),
    filledQty: String(r.filledQty),
    amount: String(r.qty),
    status: normFutStatus(r.status),
    fee: String(r.fee),
    leverage: r.leverage,
    marginType: r.marginType,
    isBot: r.isBot,
    createdAt: r.createdAt,
    source: "futures" as const,
  }));

  const normalizedSpot = spotRows.map(r => ({ ...r, source: "spot" as const }));

  // Merge and sort newest-first, cap at pageLimit * 2
  const merged = [...normalizedSpot, ...normalizedFut].sort(
    (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()
  ).slice(0, pageLimit * 2);

  // Return cursor for next page: the smallest id in this page
  const nextCursor = merged.length === pageLimit * 2
    ? Math.min(...merged.map(o => o.id))
    : null;

  res.json({ data: merged, nextCursor, count: merged.length });
});

router.get("/trades", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const pageLimit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  // Cursor-based pagination: pass the `cursor` id from the last item of the
  // previous page to fetch the next page (id DESC).
  const cursorId = req.query.cursor ? Number(req.query.cursor) : null;
  // Optional symbol filter — accepts both "BTCUSDT" and "BTC/USDT" forms so
  // mobile + web can share the same call. Resolve to pairId server-side.
  const symbolRaw = String(req.query.symbol || "").toUpperCase().trim();
  const conds: any[] = [
    eq(tradesTable.userId, userId),
    // tradesTable has no is_bot column; filter via the parent order. NOT EXISTS
    // is faster than a subselect IN (...) because it short-circuits per row.
    sql`NOT EXISTS (SELECT 1 FROM ${ordersTable} WHERE ${ordersTable.id} = ${tradesTable.orderId} AND ${ordersTable.isBot} = 1)`,
  ];
  if (cursorId) conds.push(lt(tradesTable.id, cursorId));
  if (symbolRaw) {
    // Match the pair regardless of whether the DB stores "BTCINR" or "BTC/INR".
    // Strip slashes from BOTH sides at the SQL layer so we don't have to guess
    // the quote-asset length (INR is 3 chars, USDT is 4 — heuristic splitting
    // would mis-cleave 3-char quotes).
    const symCompact = symbolRaw.replace(/\//g, "");
    if (!/^[A-Z0-9]{2,20}$/.test(symCompact)) { res.json({ data: [], nextCursor: null, count: 0 }); return; }
    const [p] = await db.select().from(pairsTable)
      .where(sql`upper(replace(${pairsTable.symbol}, '/', '')) = ${symCompact}`)
      .limit(1);
    if (!p) { res.json({ data: [], nextCursor: null, count: 0 }); return; }
    conds.push(eq(tradesTable.pairId, p.id));
  }
  const rows = await db.select().from(tradesTable)
    .where(and(...conds))
    .orderBy(desc(tradesTable.id))
    .limit(pageLimit);
  const nextCursor = rows.length === pageLimit ? rows[rows.length - 1]!.id : null;
  res.json({ data: rows, nextCursor, count: rows.length });
});

// Per-order fill breakdown — exposes every individual maker fill that
// composed the user's order, so the UI can render a Pro-style "trades
// inside this order" view (VWAP, total fee, per-fill price/qty).
//
// A single market or aggressive limit order can fill across many makers at
// different prices; the matching engine writes one trades row per fill (see
// matching-engine.ts ~L232). This endpoint pulls them back in chronological
// order plus summary aggregates so the client doesn't have to recompute
// VWAP / totals on every render.
router.get("/orders/:id/fills", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ message: "Invalid order id" });
    return;
  }
  // Scope to caller's own orders so a user can't probe another user's fills.
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)))
    .limit(1);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }

  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1);
  let baseSym = "";
  let quoteSym = "";
  if (pair) {
    const cs = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol })
      .from(coinsTable).where(inArray(coinsTable.id, [pair.baseCoinId, pair.quoteCoinId]));
    baseSym = cs.find(c => c.id === pair.baseCoinId)?.symbol ?? "";
    quoteSym = cs.find(c => c.id === pair.quoteCoinId)?.symbol ?? "";
  }

  const fills = await db.select().from(tradesTable)
    .where(eq(tradesTable.orderId, orderId))
    .orderBy(tradesTable.createdAt);

  // Aggregate so the client doesn't need to re-iterate just to render a header.
  let totalQty = 0, totalQuote = 0, totalFee = 0;
  for (const f of fills) {
    const q = Number(f.qty);
    const p = Number(f.price);
    totalQty += q;
    totalQuote += q * p;
    totalFee += Number(f.fee || 0);
  }
  const vwap = totalQty > 0 ? totalQuote / totalQty : 0;

  res.json({
    order: {
      id: order.id,
      pairId: order.pairId,
      symbol: pair?.symbol ?? "",
      base: baseSym,
      quote: quoteSym,
      side: order.side,
      type: order.type,
      status: order.status,
      price: Number(order.price ?? 0),
      qty: Number(order.qty),
      filledQty: Number(order.filledQty || 0),
      avgPrice: Number(order.avgPrice || 0),
      fee: Number(order.fee || 0),
      tds: Number(order.tds || 0),
      feeCurrency: quoteSym,
      tdsCurrency: quoteSym,
      createdAt: order.createdAt,
    },
    fills: fills.map(f => ({
      id: f.id,
      uid: f.uid,
      side: f.side,
      price: Number(f.price),
      qty: Number(f.qty),
      fee: Number(f.fee || 0),
      tds: Number(f.tds || 0),
      feeCurrency: quoteSym,
      tdsCurrency: quoteSym,
      createdAt: f.createdAt,
    })),
    summary: {
      count: fills.length,
      totalQty: Math.round(totalQty * 1e8) / 1e8,
      totalQuote: Math.round(totalQuote * 1e8) / 1e8,
      vwap: Math.round(vwap * 1e8) / 1e8,
      totalFee: Math.round(totalFee * 1e8) / 1e8,
      base: baseSym,
      quote: quoteSym,
    },
  });
});

/**
 * Shared spot-order placement. Used by `/api/orders` (modern client / admin) and
 * `/api/exchange/order` (Bicrypto Flutter mobile/web bridge). All param values
 * MUST be normalized lowercase strings; numeric `qty`/`price` finite > 0.
 *
 * Returns either a fully filled (market or auto-matched limit) order, or a
 * resting open/partial limit order. Throws an Error with `.code` (HTTP status)
 * on validation failure — callers should map to HTTP responses.
 */
/**
 * Internal helper — insert a bracket (SL / PL) sell or buy order without full
 * validation. Balance is locked normally unless noLock=true (SL leg).
 */
async function placeBracketOrder(opts: {
  userId: number; pairId: number; pair: any;
  side: "buy" | "sell";
  type: "stop_market" | "limit";
  qty: number; price?: number; stopPrice?: number;
  ocoGroupId?: string; noLock: boolean; quoteWalletType: string;
  vipTier?: number;
}): Promise<any> {
  const { userId, pairId, pair, side, type, qty, price, stopPrice, ocoGroupId, noLock, quoteWalletType, vipTier } = opts;
  const slippage = Number(pair.marketSlippagePct ?? 0.10);
  let effPrice: number;
  if (type === "stop_market") {
    const lastPx = Number(pair.lastPrice);
    effPrice = side === "buy" ? lastPx * (1 + slippage) : lastPx * (1 - slippage);
  } else {
    effPrice = Number(price);
    if (!Number.isFinite(effPrice) || effPrice <= 0) throw new Error("PL price invalid");
  }

  return db.transaction(async (tx) => {
    if (!noLock) {
      const fees = await getSpotFeeRates(vipTier ?? 0);
      if (side === "buy") {
        const lockAmt = qty * effPrice * (1 + fees.taker);
        const w = await ensureWallet(tx, userId, pair.quoteCoinId, quoteWalletType);
        if (Number(w.balance) < lockAmt) throw new Error("Insufficient quote balance for Take-Profit order");
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${lockAmt}`,
          locked:  sql`${walletsTable.locked}  + ${lockAmt}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      } else {
        const w = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
        if (Number(w.balance) < qty) throw new Error("Insufficient base balance for Take-Profit order");
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${qty}`,
          locked:  sql`${walletsTable.locked}  + ${qty}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      }
    }
    const status = type === "stop_market" ? "pending_trigger" : "open";
    const [o] = await tx.insert(ordersTable).values({
      userId, pairId, side, type,
      price: String(effPrice), qty: String(qty),
      stopPrice: stopPrice != null ? String(stopPrice) : undefined,
      status,
      noLock: noLock ? 1 : 0,
      ocoGroupId: ocoGroupId ?? null,
    }).returning();
    return o;
  });
}

export async function placeSpotOrder(opts: {
  userId: number;
  vipTier: number;
  pairId: number;
  side: "buy" | "sell";
  type: "limit" | "market" | "ioc" | "fok" | "post_only" | "stop_limit" | "stop_market";
  qty: number;
  price?: number;
  stopPrice?: number;
  /** Stop-Loss bracket price — places a stop_market order on the opposite side */
  slPrice?: number;
  /** Take-Profit bracket price — places a limit order on the opposite side */
  tpPrice?: number;
}): Promise<{ order: any; matched: number }> {
  const { userId, vipTier, pairId, side, type, qty, price, stopPrice, slPrice, tpPrice } = opts;
  const ALL_TYPES = ["limit","market","ioc","fok","post_only","stop_limit","stop_market"];
  if (!pairId || !["buy","sell"].includes(side) || !ALL_TYPES.includes(type)) {
    const e: any = new Error("pairId, side(buy/sell), type required"); e.code = 400; throw e;
  }
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    const e: any = new Error("qty must be positive"); e.code = 400; throw e;
  }

  const isStopType    = type === "stop_limit" || type === "stop_market";
  const isMarketType  = type === "market" || type === "stop_market";
  const isRestingType = type === "limit" || type === "post_only";
  const isImmediate   = isMarketType || type === "ioc" || type === "fok";

  const created = await db.transaction(async (tx) => {
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, Number(pairId))).limit(1);
      if (!pair) { const e: any = new Error("Pair not found"); e.code = 404; throw e; }
      // Determine wallet type for quote coin (INR = "inr", all crypto = "spot")
      const pairCoins = await tx.select({ id: coinsTable.id, symbol: coinsTable.symbol })
        .from(coinsTable).where(or(eq(coinsTable.id, pair.baseCoinId), eq(coinsTable.id, pair.quoteCoinId)));
      const quoteWalletType = pairCoins.find((c: any) => c.id === pair.quoteCoinId)?.symbol === "INR" ? "inr" : "spot";
      if (!pair.tradingEnabled || pair.status !== "active") { const e: any = new Error("Trading disabled for this pair"); e.code = 400; throw e; }
      if (pair.tradingStartAt && pair.tradingStartAt.getTime() > Date.now()) {
        const e: any = new Error("Trading not yet started"); e.code = 400; throw e;
      }
      const minQty = Number(pair.minQty);
      if (minQty > 0 && qtyNum < minQty) { const e: any = new Error(`Min qty is ${minQty}`); e.code = 400; throw e; }
      const maxQty = Number(pair.maxQty);
      if (maxQty > 0 && qtyNum > maxQty) { const e: any = new Error(`Max qty is ${maxQty}`); e.code = 400; throw e; }
      const minNotional = Number((pair as any).minNotional ?? 0);
      if (minNotional > 0 && price != null) {
        const notionalCheck = qtyNum * Number(price);
        if (notionalCheck < minNotional) {
          const e: any = new Error(`Order value too small — minimum notional is ${minNotional} ${(pair as any).quoteSymbol ?? ""}`);
          e.code = 400; throw e;
        }
      }

      const fees = await getSpotFeeRates(vipTier);
      // IOC and FOK are aggressive (taker) even though they carry a limit price.
      const feeRate = isImmediate ? fees.taker : fees.maker;
      // Per-pair configurable slippage cap for market orders (default 10%)
      const marketSlippagePct = Number((pair as any).marketSlippagePct ?? 0.10);

      // Price stored on the order row:
      //  LIMIT / IOC / FOK / post_only → user's chosen price
      //  MARKET                        → lastPrice ± slippage cap (worst-case sweep price)
      //  STOP_LIMIT                    → user's chosen limit price (honoured at trigger)
      //  STOP_MARKET                   → lastPrice ± slippage cap at placement time
      //                                   (recalculated at trigger time by stop engine)
      let effPrice: number;
      if (isMarketType && !isStopType) {
        const lastPx = Number(pair.lastPrice);
        if (!Number.isFinite(lastPx) || lastPx <= 0) { const e: any = new Error("Market price unavailable"); e.code = 400; throw e; }
        effPrice = side === "buy" ? lastPx * (1 + marketSlippagePct) : lastPx * (1 - marketSlippagePct);
      } else if (isStopType && type === "stop_market") {
        const lastPx = Number(pair.lastPrice);
        if (!Number.isFinite(lastPx) || lastPx <= 0) { const e: any = new Error("Market price unavailable"); e.code = 400; throw e; }
        effPrice = side === "buy" ? lastPx * (1 + marketSlippagePct) : lastPx * (1 - marketSlippagePct);
      } else {
        effPrice = Number(price);
        if (!Number.isFinite(effPrice) || effPrice <= 0) { const e: any = new Error("limit price required"); e.code = 400; throw e; }
      }
      void feeRate;

      // Lock balances against the WORST-CASE settlement.
      //  - BUY (market or limit): qty * price * (1 + takerFee)
      //    Limit buys lock fee upfront so the matching engine can always deduct
      //    the fee from the pre-locked slice without touching free balance.
      //    Any over-lock (price improvement + fee difference) is refunded per fill.
      //  - SELL ANY   : qty (base coin)
      let baseW: any = null, quoteW: any = null;
      if (side === "buy") {
        const lockQuote = qtyNum * effPrice * (1 + fees.taker);
        quoteW = await ensureWallet(tx, userId, pair.quoteCoinId, quoteWalletType);
        const bal = Number(quoteW.balance);
        if (bal < lockQuote) { const e: any = new Error(`Insufficient quote balance (have ${bal.toFixed(8)}, need ${lockQuote.toFixed(8)})`); e.code = 400; throw e; }
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${lockQuote}`,
          locked: sql`${walletsTable.locked} + ${lockQuote}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, quoteW.id));
      } else {
        baseW = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
        const bal = Number(baseW.balance);
        if (bal < qtyNum) { const e: any = new Error(`Insufficient base balance (have ${bal.toFixed(8)}, need ${qtyNum.toFixed(8)})`); e.code = 400; throw e; }
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${qtyNum}`,
          locked: sql`${walletsTable.locked} + ${qtyNum}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, baseW.id));
      }

      const [o] = await tx.insert(ordersTable).values({
        userId, pairId: pair.id, side, type,
        price: String(effPrice), qty: String(qtyNum),
        stopPrice: stopPrice != null ? String(stopPrice) : undefined,
        status: isStopType ? "pending_trigger" : "open",
      }).returning();
      return { order: o, pair, quoteWalletType };
    });
  const { order, pair, quoteWalletType } = created as any;

  // Stop orders: held as pending_trigger until the stop-order engine fires them
  if (isStopType) {
    await rPublish(`orders.${pair.symbol}`, { action: "new", order: { id: order.id, status: "pending_trigger", type: order.type } });
    return { order, matched: 0 };
  }

  // post_only: reject immediately if the order would cross the spread now
  if (type === "post_only") {
    const crosses = await wouldCrossBook(pair.symbol, side, Number(order.price));
    if (crosses) {
      await cancelOrderAndRefund(order, userId, pair, vipTier, quoteWalletType);
      const e: any = new Error("post_only order would cross the spread — order rejected");
      e.code = 400; throw e;
    }
  }

  // FOK: pre-check — enough liquidity to fill the entire order at this price?
  if (type === "fok") {
    const available = await availableQtyForSide(pair.symbol, side, Number(order.price));
    if (available < qtyNum) {
      await cancelOrderAndRefund(order, userId, pair, vipTier, quoteWalletType);
      const e: any = new Error("Insufficient liquidity for Fill-Or-Kill order");
      e.code = 400; throw e;
    }
  }

  // Push resting orders (limit, post_only) into the Redis orderbook ZSET.
  // IOC, FOK, market orders do NOT rest in the book.
  if (isRestingType) {
    await pushOrderToRedis(order, pair, "new");
  }

  // Run the matching engine. takerInBook=true for orders already in the Redis
  // ZSET so the engine can update the taker's ZSET payload inside the same
  // locked transaction as each maker fill, preventing race conditions.
  const matchRes = await tryMatch(order.id, {
    takerVipTier: vipTier,
    takerInBook: isRestingType,
  });

  // Refresh the order row to see what actually filled.
  const [refreshed] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)).limit(1);
  let final = refreshed ?? order;

  // For MARKET / IOC / FOK orders: cancel any unfilled remainder and refund
  // the unused lock. These order types never rest in the book.
  if (isImmediate && final.status !== "filled") {
    const remainingQty = Number(final.qty) - Number(final.filledQty ?? 0);
    if (remainingQty > 1e-8) {
      await db.transaction(async (tx) => {
        const fees = await getSpotFeeRates(vipTier);
        if (final.side === "buy") {
          const refund = remainingQty * Number(final.price) * (1 + fees.taker);
          const w = await ensureWallet(tx, userId, pair.quoteCoinId, quoteWalletType);
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${refund}`,
            locked: sql`${walletsTable.locked} - ${refund}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        } else {
          const w = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${remainingQty}`,
            locked: sql`${walletsTable.locked} - ${remainingQty}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        }
        const newStatus = Number(final.filledQty ?? 0) > 0 ? "partial_cancelled" : "cancelled";
        const [u] = await tx.update(ordersTable).set({
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, final.id)).returning();
        final = u ?? final;
      });
    }
  }

  if (final.status === "filled" || final.status === "cancelled" || final.status === "partial") {
    await pushOrderToRedis(final, pair, "fill");
  } else if (isRestingType) {
    // Resting limit/post_only order with no fill — keep Redis member up to date.
    await rSet(`orderbook:${pair.symbol}:order:${final.id}`, JSON.stringify({
      id: final.id, userId: final.userId, side: final.side, type: final.type,
      price: Number(final.price), qty: Number(final.qty),
      filledQty: Number(final.filledQty ?? 0), status: final.status, ts: Date.now(),
    }), 86400);
  }

  // ── 5-level trading-fee referral commission (fire-and-forget) ────────────
  if (matchRes.trades > 0) {
    const grossFee = parseFloat(final.fee ?? "0");
    if (grossFee > 0) {
      // Referral commission is paid on the base exchange fee (pre-GST).
      // final.fee = baseFee × (1 + gst%/100); back out the GST before crediting.
      // sourceRefId = "spot:{orderId}" — ensures exactly-once credit per order.
      // INR pairs: convert fee to USDT equivalent so all commissions stay in
      // one consistent currency (avoids mixed-currency sum in /refer/stats).
      const spotRefId = `spot:${final.id}`;
      getSpotFeeRates(vipTier).then(async ({ gstPercent }) => {
        const baseFeeAmt = grossFee / (1 + gstPercent / 100);

        const [quoteCoin] = await db.select({ symbol: coinsTable.symbol })
          .from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)).limit(1);

        if (quoteCoin?.symbol === "INR") {
          const rate = getInrRate();
          if (rate <= 0) return; // rate not yet loaded — skip rather than use wrong value
          const feeUsdt = baseFeeAmt / rate;
          const [usdtCoin] = await db.select({ id: coinsTable.id })
            .from(coinsTable).where(eq(coinsTable.symbol, "USDT")).limit(1);
          if (!usdtCoin) return;
          return creditTradingFeeReferralChain(userId, feeUsdt, usdtCoin.id, "trading_fee", spotRefId);
        }

        return creditTradingFeeReferralChain(userId, baseFeeAmt, pair.quoteCoinId, "trading_fee", spotRefId);
      }).catch((err: unknown) => {
        logger.error({ err, orderId: final.id }, "Referral commission failed — investigate");
      });
    }
  }

  // ── Copy trading (fire-and-forget) ──────────────────────────────────────
  if (matchRes.trades > 0) {
    const filledQty = Number(final.filledQty ?? 0);
    if (filledQty > 0 && pair.baseCoinId && pair.quoteCoinId) {
      triggerCopyTrades(userId, {
        pairId:       pair.id,
        side:         final.side as "buy" | "sell",
        filledQty,
        price:        Number(final.avgPrice ?? final.price),
        baseCoinId:   pair.baseCoinId,
        quoteCoinId:  pair.quoteCoinId,
      }).catch((err: unknown) => {
        logger.error({ err, orderId: final.id }, "Copy trade trigger failed — investigate");
      });
    }
  }

  // ── OCO bracket orders (SL + PL) ─────────────────────────────────────────
  // Bracket legs are placed only when the main order filled at least partially.
  // SL (stop_market) is placed without locking balance (noLock=1); it locks
  // balance at trigger time after cancelling the PL leg first.
  // PL (limit) locks the base coin normally so it sits as a resting maker.
  // Both legs share an ocoGroupId — when either fills, the engine cancels the other.
  const bracketFilledQty = Number(final.filledQty ?? 0);
  if (bracketFilledQty > 1e-10 && (slPrice != null || tpPrice != null)) {
    const bracketSide: "buy" | "sell" = side === "buy" ? "sell" : "buy";
    const ocoGroupId = slPrice != null && tpPrice != null
      ? randomUUID().replace(/-/g, "") : undefined;

    if (slPrice != null) {
      try {
        const slOrder = await placeBracketOrder({
          userId, pairId, pair, side: bracketSide, type: "stop_market",
          qty: bracketFilledQty, stopPrice: slPrice, ocoGroupId,
          noLock: true, quoteWalletType, vipTier,
        });
        await rPublish(`orders.${pair.symbol}`, { action: "new", order: { id: slOrder.id, status: "pending_trigger", type: "stop_market", ocoGroupId } });
        await rPublish(`orders.user.${userId}`, { action: "new", order: { id: slOrder.id, status: "pending_trigger", type: "stop_market", ocoGroupId } });
      } catch (e) {
        logger.warn({ err: e, userId, pairId }, "SL bracket order placement failed");
      }
    }

    if (tpPrice != null) {
      try {
        const plOrder = await placeBracketOrder({
          userId, pairId, pair, side: bracketSide, type: "limit",
          qty: bracketFilledQty, price: tpPrice, ocoGroupId,
          noLock: false, quoteWalletType, vipTier,
        });
        const score = (plOrder.side === "buy" ? -1 : 1) * Number(plOrder.price);
        await rZadd(`orderbook:${pair.symbol}:${plOrder.side}`, score, String(plOrder.id));
        await rSet(`orderbook:${pair.symbol}:order:${plOrder.id}`, JSON.stringify({
          id: plOrder.id, userId: plOrder.userId, side: plOrder.side, type: plOrder.type,
          price: Number(plOrder.price), qty: Number(plOrder.qty), filledQty: 0,
          status: "open", ts: Date.now(),
        }), 86400);
        await rPublish(`orders.${pair.symbol}`, { action: "new", order: { id: plOrder.id, status: "open", type: "limit", ocoGroupId } });
        await rPublish(`orders.user.${userId}`, { action: "new", order: { id: plOrder.id, status: "open", type: "limit", ocoGroupId } });
      } catch (e) {
        logger.warn({ err: e, userId, pairId }, "PL bracket order placement failed");
      }
    }
  }

  return { order: final, matched: matchRes.trades };
}

// ─── /orders/:id/invoice — printable tax invoice for a filled order ──────
// Returns a self-contained JSON payload the user-portal renders into a
// print-friendly invoice page (the user can then "Save as PDF" from the
// browser print dialog). Only orders with at least one fill are eligible —
// open / fully-cancelled orders have nothing to invoice.
//
// Fee breakdown: the stored `fee` includes GST baked in (matching engine
// applies `baseRate * (1 + gstPct/100)`), so we back it out here so the
// invoice can show "Trading fee" and "GST 18%" on separate lines as
// required for Indian tax compliance.
router.get("/orders/:id/invoice", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ message: "Invalid order id" });
    return;
  }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)))
    .limit(1);
  if (!order) { res.status(404).json({ message: "Order not found" }); return; }
  if (Number(order.filledQty || 0) <= 0) {
    res.status(400).json({ message: "No fills yet — invoice is generated only after at least one match." });
    return;
  }

  const [pair] = await db.select().from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1);
  let baseSym = "", quoteSym = "";
  if (pair) {
    const cs = await db.select().from(coinsTable);
    baseSym = cs.find(c => c.id === pair.baseCoinId)?.symbol ?? "";
    quoteSym = cs.find(c => c.id === pair.quoteCoinId)?.symbol ?? "";
  }

  const fills = await db.select().from(tradesTable)
    .where(eq(tradesTable.orderId, orderId))
    .orderBy(tradesTable.createdAt);

  // Aggregate exactly what's persisted on the order row — we don't recompute
  // from the live fee/GST settings because those may have changed since the
  // trade was executed and the invoice MUST match the wallet movements.
  const grossFee = Number(order.fee || 0);                    // already includes GST
  const tdsAmount = Number(order.tds || 0);
  let totalQty = 0, totalQuote = 0;
  for (const f of fills) {
    totalQty += Number(f.qty);
    totalQuote += Number(f.qty) * Number(f.price);
  }
  const vwap = totalQty > 0 ? totalQuote / totalQty : 0;

  // GST % — use the rate snapshotted on the FIRST fill (gstPct column added
  // after the initial schema). Falls back to the current admin setting when
  // the column is null (fills recorded before the schema migration).
  const gstFromFill = Number(fills[0]?.gstPct ?? -1);
  const feeSettings = await loadFeeSettings();
  const gstPct = gstFromFill >= 0 ? gstFromFill : Number(feeSettings.spotGstPercent || 0);
  const baseFee = gstPct > 0 ? grossFee / (1 + gstPct / 100) : grossFee;
  const gstAmount = grossFee - baseFee;

  // For SELL the user RECEIVES (notional - fee - tds).
  // For BUY  the user PAYS    (notional + fee). TDS doesn't apply on buys.
  const isSell = order.side === "sell";
  const grandTotal = isSell ? (totalQuote - grossFee - tdsAmount) : (totalQuote + grossFee);

  const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // Brand / company info — admin can override any of these from /admin/settings
  // raw key editor. Defaults are placeholders that look plausible on a real
  // tax invoice without leaking anything sensitive.
  const settingsRows = await db.select().from(settingsTable);
  const brandMap = new Map(settingsRows.map(r => [r.key, r.value]));
  const brand = {
    legalName:    brandMap.get("brand.legal_name")    || "Zebvix Technologies Private Limited",
    tradingName:  brandMap.get("brand.trading_name")  || "Zebvix Exchange",
    address:      brandMap.get("brand.address")       || COMPANY_ADDRESS,
    gstin:        brandMap.get("brand.gstin")         || COMPANY_GST,
    pan:          brandMap.get("brand.pan")           || COMPANY_PAN,
    cin:          brandMap.get("brand.cin")           || COMPANY_CIN,
    supportEmail: brandMap.get("brand.support_email") || "support@zebvix.com",
    website:      brandMap.get("brand.website")       || "https://zebvix.com",
  };

  const invoiceNo = `INV-${String(order.id).padStart(8, "0")}`;
  const lastFillAt = fills[fills.length - 1]?.createdAt ?? order.createdAt;

  res.json({
    invoiceNo,
    issuedAt: lastFillAt,
    currency: quoteSym,
    brand,
    customer: {
      name: u?.name || "—",
      email: u?.email || "—",
      userId,
    },
    order: {
      id: order.id,
      symbol: pair?.symbol ?? "",
      base: baseSym,
      quote: quoteSym,
      side: order.side,
      type: order.type,
      status: order.status,
      qty: Number(order.qty),
      filledQty: totalQty,
      avgPrice: vwap,
      placedAt: order.createdAt,
    },
    breakdown: {
      grossNotional: +totalQuote.toFixed(8),
      tradingFee: +baseFee.toFixed(8),
      gstPercent: gstPct,
      gstAmount: +gstAmount.toFixed(8),
      totalFee: +grossFee.toFixed(8),
      tdsPercent: totalQuote > 0 ? +((tdsAmount / totalQuote) * 100).toFixed(4) : 0,
      tdsAmount: +tdsAmount.toFixed(8),
      netAmount: +grandTotal.toFixed(8),
      direction: isSell ? "credit" : "debit",
      inrRate: getInrRate(),
      netInr: quoteSym === "INR"
        ? +grandTotal.toFixed(2)
        : +(grandTotal * getInrRate()).toFixed(2),
    },
    fills: fills.map(f => ({
      id: f.id,
      uid: f.uid,
      price: Number(f.price),
      qty: Number(f.qty),
      subtotal: +(Number(f.qty) * Number(f.price)).toFixed(8),
      fee: Number(f.fee || 0),
      tds: Number(f.tds || 0),
      executedAt: f.createdAt,
    })),
  });
});

// Single order fetch — used by frontends to poll status after placement
// without pulling the entire order list. Scoped to the authenticated user
// (isBot=0 guard ensures bot orders never leak into user-facing responses).
router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.isBot, 0)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(order);
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to place orders. Please complete KYC verification." });
    return;
  }
  const vipTier = Math.max(0, Math.min(5, req.user!.vipTier ?? 0));
  const parsed = PlaceOrderBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({
      error: first?.message || "Invalid order",
      field: first?.path?.join(".") || "body",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const { pairId, side, type, price, qty, stopPrice } = parsed.data;
  try {
    const result = await placeSpotOrder({
      userId, vipTier, pairId, side, type, qty, price, stopPrice,
    });
    res.status(201).json(result.matched > 0 ? { ...result.order, matched: result.matched } : result.order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

/**
 * Shared spot-order cancellation. Releases locked balance, marks order
 * cancelled, pushes redis update. Throws Error with `.code` on failure.
 */
export async function cancelSpotOrderById(userId: number, id: number): Promise<any> {
  if (!id) { const e: any = new Error("id required"); e.code = 400; throw e; }
  const cancelled = await db.transaction(async (tx) => {
      // SECURITY: never let a real-user request mutate a bot order, even when
      // the bot account currently runs under the same user_id (e.g. admin).
      // Bot orders must only be cancelled by the bot lifecycle / admin tools.
      const [o] = await tx.select().from(ordersTable).where(and(
        eq(ordersTable.id, id),
        eq(ordersTable.userId, userId),
        eq(ordersTable.isBot, 0),
      )).for("update").limit(1);
      if (!o) { const e: any = new Error("Order not found"); e.code = 404; throw e; }
      if (!["open","partial","pending_trigger"].includes(o.status)) { const e: any = new Error(`Cannot cancel — status is ${o.status}`); e.code = 400; throw e; }
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, o.pairId)).limit(1);
      if (!pair) { const e: any = new Error("Pair missing"); e.code = 500; throw e; }
      const remainingQty = Number(o.qty) - Number(o.filledQty);
      const remainingPrice = Number(o.price);
      // noLock=1: SL bracket leg — no balance was locked at placement; skip wallet refund.
      if (!Number(o.noLock)) {
        const cancelCoins = await tx.select({ id: coinsTable.id, symbol: coinsTable.symbol })
          .from(coinsTable).where(or(eq(coinsTable.id, pair.baseCoinId), eq(coinsTable.id, pair.quoteCoinId)));
        const cancelQuoteWt = cancelCoins.find((c: any) => c.id === pair.quoteCoinId)?.symbol === "INR" ? "inr" : "spot";
        if (o.side === "buy") {
          // The lock at placement was qty * price * (1 + takerFeeRate).
          // Refund the full per-remaining-qty slice including the fee buffer.
          const [u] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          const fees = await getSpotFeeRates(u?.vipTier ?? 0);
          const release = remainingQty * remainingPrice * (1 + fees.taker);
          const w = await ensureWallet(tx, userId, pair.quoteCoinId, cancelQuoteWt);
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${release}`,
            locked: sql`${walletsTable.locked} - ${release}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        } else {
          const w = await ensureWallet(tx, userId, pair.baseCoinId, "spot");
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${remainingQty}`,
            locked: sql`${walletsTable.locked} - ${remainingQty}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        }
      }
      const newStatus = Number(o.filledQty ?? 0) > 0 ? "partial_cancelled" : "cancelled";
      const [updated] = await tx.update(ordersTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(ordersTable.id, id)).returning();
      return { order: updated, pair };
  });
  const { order, pair } = cancelled as any;
  await pushOrderToRedis(order, pair, "cancel");
  return order;
}

router.post("/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  try {
    const order = await cancelSpotOrderById(userId, id);
    res.json(order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

/**
 * Operator-only force-cancel. Mirrors {@link cancelSpotOrderById} but does
 * NOT enforce userId match and DOES allow cancelling bot orders. The caller
 * (admin route) is responsible for permission gating + audit logging.
 *
 * Returns the cancelled order; throws an Error with `.code` (404 / 400 / 500)
 * for the route handler to translate into a status code.
 */
export async function adminCancelSpotOrderById(id: number): Promise<any> {
  if (!id) { const e: any = new Error("id required"); e.code = 400; throw e; }
  const cancelled = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, id)).for("update").limit(1);
    if (!o) { const e: any = new Error("Order not found"); e.code = 404; throw e; }
    if (!["open","partial","pending_trigger"].includes(o.status)) {
      const e: any = new Error(`Cannot cancel — status is ${o.status}`); e.code = 400; throw e;
    }
    const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, o.pairId)).limit(1);
    if (!pair) { const e: any = new Error("Pair missing"); e.code = 500; throw e; }
    const adminRemainingQty = Number(o.qty) - Number(o.filledQty);
    const adminRemainingPrice = Number(o.price);
    // noLock=1: SL bracket leg — no balance was locked at placement; skip wallet refund.
    if (!Number(o.noLock)) {
      const adminCancelCoins = await tx.select({ id: coinsTable.id, symbol: coinsTable.symbol })
        .from(coinsTable).where(or(eq(coinsTable.id, pair.baseCoinId), eq(coinsTable.id, pair.quoteCoinId)));
      const adminCancelQuoteWt = adminCancelCoins.find((c: any) => c.id === pair.quoteCoinId)?.symbol === "INR" ? "inr" : "spot";
      if (o.side === "buy") {
        // Full fee-buffered refund (mirrors placement lock)
        const [u] = await tx.select({ vipTier: usersTable.vipTier }).from(usersTable).where(eq(usersTable.id, o.userId)).limit(1);
        const fees = await getSpotFeeRates(u?.vipTier ?? 0);
        const release = adminRemainingQty * adminRemainingPrice * (1 + fees.taker);
        const w = await ensureWallet(tx, o.userId, pair.quoteCoinId, adminCancelQuoteWt);
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${release}`,
          locked: sql`${walletsTable.locked} - ${release}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      } else {
        const w = await ensureWallet(tx, o.userId, pair.baseCoinId, "spot");
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${adminRemainingQty}`,
          locked: sql`${walletsTable.locked} - ${adminRemainingQty}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      }
    }
    const adminNewStatus = Number(o.filledQty ?? 0) > 0 ? "partial_cancelled" : "cancelled";
    const [updated] = await tx.update(ordersTable)
      .set({ status: adminNewStatus, updatedAt: new Date() })
      .where(eq(ordersTable.id, id)).returning();
    return { order: updated, pair };
  });
  const { order, pair } = cancelled as any;
  await pushOrderToRedis(order, pair, "cancel");
  return order;
}

// ====== Public orderbook + recent trades from Redis ======
router.get("/orderbook/:symbol", async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  const levels = Math.min(100, Math.max(5, Number(req.query.levels) || 20));
  const depth = await getDepth(symbol, levels);
  res.setHeader("X-Cache", "REDIS");
  res.json({ symbol, ...depth, ts: Date.now() });
});

router.get("/trades/:symbol/recent", async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol || "").toUpperCase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const trades = await getRecentTrades(symbol, limit);
  res.setHeader("X-Cache", "REDIS");
  res.json({ symbol, trades, ts: Date.now() });
});

void coinsTable;
export default router;
