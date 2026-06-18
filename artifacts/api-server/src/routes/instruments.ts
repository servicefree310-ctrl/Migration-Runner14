/**
 * Instruments trading — Forex, Stocks, Commodities (Gold, Silver, etc.)
 *
 *   GET    /instruments                      — list instruments (filterable by assetClass)
 *   GET    /instruments/:symbol              — single instrument detail
 *   GET    /instruments/:symbol/quote        — live price quote
 *   POST   /instruments/orders               — place order (requireAuth)
 *   GET    /instruments/orders               — user's order history (requireAuth)
 *   GET    /instruments/positions            — user's open positions (requireAuth)
 *   POST   /instruments/positions/:id/close  — close a position (requireAuth)
 *
 *   Admin:
 *   GET    /admin/broker-config              — get broker config (adminOnly)
 *   POST   /admin/broker-config             — save broker config (adminOnly)
 *   POST   /admin/broker-config/login       — trigger Angel One login (adminOnly)
 *   GET    /admin/instruments               — list all instruments (adminOnly)
 *   POST   /admin/instruments               — create instrument (adminOnly)
 *   PATCH  /admin/instruments/:id           — update instrument (adminOnly)
 *   DELETE /admin/instruments/:id           — delete instrument (adminOnly)
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  instrumentsTable,
  instrumentOrdersTable,
  instrumentPositionsTable,
  brokerConfigTable,
  walletsTable,
  walletLedgerTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

import { getQuote, placeOrder, loginAngelOne, invalidateBrokerConfigCache } from "../lib/angel-one-adapter";

const adminOnly = [requireAuth, requireRole("admin", "superadmin")];

const router: IRouter = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────
const placeOrderSchema = z.object({
  symbol:   z.string().min(1).max(20).transform(s => s.toUpperCase()),
  side:     z.enum(["buy", "sell"]),
  qty:      z.number({ invalid_type_error: "qty must be a number" }).positive("qty must be > 0"),
  price:    z.number().positive().optional(),
  type:     z.enum(["MARKET", "LIMIT", "STOPLOSS"]).default("MARKET"),
  leverage: z.number().int().min(1).max(200).default(1),
});

// ─── Public: List instruments ─────────────────────────────────────────────────
router.get("/instruments", async (req, res): Promise<void> => {
  // Accept both `assetClass` and `category` query params (aliases)
  const rawCategory = String(req.query.category ?? req.query.assetClass ?? "").toLowerCase() || null;
  const exchange = String(req.query.exchange ?? "").toUpperCase() || null;
  const search = String(req.query.search ?? "").toUpperCase() || null;

  // Map frontend category names to DB assetClass values (DB uses singular: stock, commodity)
  const categoryMap: Record<string, string> = {
    forex: "forex",
    stocks: "stock",
    stock: "stock",
    commodities: "commodity",
    commodity: "commodity",
    index: "index",
  };
  const assetClass = rawCategory ? (categoryMap[rawCategory] ?? rawCategory) : null;

  let rows = await db
    .select()
    .from(instrumentsTable)
    .where(eq(instrumentsTable.tradingEnabled, true))
    .orderBy(asc(instrumentsTable.assetClass), asc(instrumentsTable.symbol));

  if (assetClass) rows = rows.filter((r) => r.assetClass === assetClass);
  if (exchange) rows = rows.filter((r) => r.exchange === exchange);
  if (search) rows = rows.filter((r) => r.symbol.includes(search) || r.name.toUpperCase().includes(search));

  res.json({ instruments: rows });
});

// ─── Public: Single instrument ────────────────────────────────────────────────
router.get("/instruments/:symbol", async (req, res): Promise<void> => {
  const symbol = req.params.symbol.toUpperCase();
  const [inst] = await db.select().from(instrumentsTable).where(eq(instrumentsTable.symbol, symbol)).limit(1);
  if (!inst) { res.status(404).json({ error: "Instrument not found" }); return; }
  res.json({ instrument: inst });
});

// ─── Public: Live quote ───────────────────────────────────────────────────────
router.get("/instruments/:symbol/quote", async (req, res): Promise<void> => {
  const symbol = req.params.symbol.toUpperCase();
  const quote = await getQuote(symbol);
  if (!quote) { res.status(404).json({ error: "Instrument not found" }); return; }
  // Update DB price
  await db.update(instrumentsTable).set({
    currentPrice: String(quote.ltp),
    high24h: String(quote.high),
    low24h: String(quote.low),
    change24h: String(quote.changePct),
    priceUpdatedAt: new Date(),
  }).where(eq(instrumentsTable.symbol, symbol));
  res.json({ quote });
});

// ─── Auth: Place order ────────────────────────────────────────────────────────
router.post("/instruments/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
    return;
  }
  const { symbol, side, qty, price, type, leverage } = parsed.data;

  const [instrument] = await db
    .select()
    .from(instrumentsTable)
    .where(and(eq(instrumentsTable.symbol, symbol.toUpperCase()), eq(instrumentsTable.tradingEnabled, true)))
    .limit(1);

  if (!instrument) { res.status(404).json({ error: "Instrument not found or trading disabled" }); return; }

  const quote = await getQuote(symbol.toUpperCase());
  if (!quote) { res.status(503).json({ error: "Price unavailable" }); return; }

  const execPrice = type === "MARKET" ? quote.ltp : (price ?? quote.ltp);
  const lev = Math.min(Math.max(1, leverage), instrument.maxLeverage);
  const notional = execPrice * qty;
  const marginRequired = notional * Number(instrument.marginRequired) / lev;
  const fee = notional * Number(instrument.takerFee);

  // Check INR wallet balance
  const quoteCoin = instrument.quoteCurrency;
  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(and(
      eq(walletsTable.userId, userId),
      eq(walletsTable.walletType, "spot"),
      sql`${walletsTable.coinId} = (SELECT id FROM coins WHERE symbol = ${quoteCoin} LIMIT 1)`,
    ))
    .limit(1);

  const available = Number(wallet?.balance ?? 0) - Number(wallet?.locked ?? 0);
  const totalCost = side === "buy" ? marginRequired + fee : fee;

  if (side === "buy" && available < totalCost) {
    res.status(400).json({ error: `Insufficient ${quoteCoin} balance. Need ${totalCost.toFixed(2)}, have ${available.toFixed(2)}` });
    return;
  }

  // Place via broker adapter
  const brokerResult = await placeOrder({
    symbol: instrument.brokerSymbol ?? symbol.toUpperCase(),
    side: side.toUpperCase() as "BUY" | "SELL",
    qty,
    price,
    type,
    brokerToken: instrument.brokerToken ?? "",
    exchange: instrument.exchange,
  });

  const status = brokerResult.status === "placed"
    ? (type === "MARKET" ? "filled" : "open")
    : "rejected";

  // Insert order record
  const [order] = await db.insert(instrumentOrdersTable).values({
    userId,
    instrumentId: instrument.id,
    side,
    type,
    qty: String(qty),
    price: price ? String(price) : null,
    filledQty: status === "filled" ? String(qty) : "0",
    avgFillPrice: status === "filled" ? String(execPrice) : null,
    status,
    brokerOrderId: brokerResult.brokerOrderId,
    brokerStatus: brokerResult.status,
    leverage: lev,
    marginUsed: String(marginRequired),
    fee: String(fee),
    notes: brokerResult.message ?? null,
  }).returning();

  // If filled, create/update position
  if (status === "filled") {
    const [existingPos] = await db
      .select()
      .from(instrumentPositionsTable)
      .where(and(
        eq(instrumentPositionsTable.userId, userId),
        eq(instrumentPositionsTable.instrumentId, instrument.id),
        eq(instrumentPositionsTable.status, "open"),
      ))
      .limit(1);

    if (!existingPos) {
      await db.insert(instrumentPositionsTable).values({
        userId,
        instrumentId: instrument.id,
        side,
        qty: String(qty),
        avgEntryPrice: String(execPrice),
        currentPrice: String(execPrice),
        leverage: lev,
        marginUsed: String(marginRequired),
      });
    } else {
      const newQty = Number(existingPos.qty) + (side === existingPos.side ? qty : -qty);
      if (newQty <= 0) {
        const realizedPnl = side !== existingPos.side
          ? (execPrice - Number(existingPos.avgEntryPrice)) * Math.abs(Number(existingPos.qty))
          : 0;
        await db.update(instrumentPositionsTable)
          .set({ status: "closed", closedAt: new Date(), realizedPnl: String(Number(existingPos.realizedPnl) + realizedPnl) })
          .where(eq(instrumentPositionsTable.id, existingPos.id));
      } else {
        const newAvg = side === existingPos.side
          ? (Number(existingPos.avgEntryPrice) * Number(existingPos.qty) + execPrice * qty) / newQty
          : Number(existingPos.avgEntryPrice);
        await db.update(instrumentPositionsTable)
          .set({ qty: String(newQty), avgEntryPrice: String(newAvg), currentPrice: String(execPrice) })
          .where(eq(instrumentPositionsTable.id, existingPos.id));
      }
    }

    // Deduct margin from wallet + write ledger debit.
    // Wrapped in a transaction with FOR UPDATE so concurrent orders on the
    // same account cannot double-spend the same balance.
    if (wallet && side === "buy") {
      const deduction = marginRequired + fee;
      await db.transaction(async (tx) => {
        // Re-read with row-level lock to prevent concurrent double-spend.
        const [lockedW] = await tx.select().from(walletsTable)
          .where(eq(walletsTable.id, wallet!.id)).for("update").limit(1);
        if (!lockedW) return;
        const balBefore = Number(lockedW.balance);
        if (balBefore < deduction) {
          const e: any = new Error(`Insufficient balance (need ${deduction.toFixed(2)}, have ${balBefore.toFixed(2)})`);
          e.code = 400;
          throw e;
        }
        const balAfter = balBefore - deduction;
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} - ${deduction}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, lockedW.id));
        await tx.insert(walletLedgerTable).values({
          userId,
          coinId: lockedW.coinId,
          walletType: "spot",
          type: "instruments_margin",
          amount: String(-deduction),
          balanceBefore: String(balBefore),
          balanceAfter: String(balAfter),
          refType: "instrument_order",
          refId: String(order.id),
          note: `${symbol} ${side} ×${qty} margin+fee`,
        });
      });
    }
  }

  res.json({ order, brokerResult });
});

// ─── Auth: Order history ──────────────────────────────────────────────────────
router.get("/instruments/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const orders = await db
    .select({
      id: instrumentOrdersTable.id,
      side: instrumentOrdersTable.side,
      type: instrumentOrdersTable.type,
      qty: instrumentOrdersTable.qty,
      price: instrumentOrdersTable.price,
      filledQty: instrumentOrdersTable.filledQty,
      avgFillPrice: instrumentOrdersTable.avgFillPrice,
      status: instrumentOrdersTable.status,
      leverage: instrumentOrdersTable.leverage,
      fee: instrumentOrdersTable.fee,
      pnl: instrumentOrdersTable.pnl,
      createdAt: instrumentOrdersTable.createdAt,
      symbol: instrumentsTable.symbol,
      name: instrumentsTable.name,
      assetClass: instrumentsTable.assetClass,
      quoteCurrency: instrumentsTable.quoteCurrency,
    })
    .from(instrumentOrdersTable)
    .leftJoin(instrumentsTable, eq(instrumentsTable.id, instrumentOrdersTable.instrumentId))
    .where(eq(instrumentOrdersTable.userId, userId))
    .orderBy(desc(instrumentOrdersTable.createdAt))
    .limit(limit);
  res.json({ orders });
});

// ─── Auth: Open positions ─────────────────────────────────────────────────────
router.get("/instruments/positions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const positions = await db
    .select({
      id: instrumentPositionsTable.id,
      side: instrumentPositionsTable.side,
      qty: instrumentPositionsTable.qty,
      avgEntryPrice: instrumentPositionsTable.avgEntryPrice,
      currentPrice: instrumentPositionsTable.currentPrice,
      unrealizedPnl: instrumentPositionsTable.unrealizedPnl,
      realizedPnl: instrumentPositionsTable.realizedPnl,
      marginUsed: instrumentPositionsTable.marginUsed,
      leverage: instrumentPositionsTable.leverage,
      status: instrumentPositionsTable.status,
      createdAt: instrumentPositionsTable.createdAt,
      symbol: instrumentsTable.symbol,
      name: instrumentsTable.name,
      assetClass: instrumentsTable.assetClass,
      quoteCurrency: instrumentsTable.quoteCurrency,
      exchange: instrumentsTable.exchange,
    })
    .from(instrumentPositionsTable)
    .leftJoin(instrumentsTable, eq(instrumentsTable.id, instrumentPositionsTable.instrumentId))
    .where(and(eq(instrumentPositionsTable.userId, userId), eq(instrumentPositionsTable.status, "open")))
    .orderBy(desc(instrumentPositionsTable.createdAt));

  // Enrich with live prices + unrealized PnL
  const enriched = await Promise.all(
    positions.map(async (p) => {
      if (!p.symbol) return p;
      const quote = await getQuote(p.symbol).catch(() => null);
      if (!quote) return p;
      const ltp = quote.ltp;
      const entryPrice = Number(p.avgEntryPrice);
      const qty = Number(p.qty);
      const unrealized = p.side === "buy"
        ? (ltp - entryPrice) * qty
        : (entryPrice - ltp) * qty;
      return { ...p, currentPrice: ltp, unrealizedPnl: unrealized };
    }),
  );

  res.json({ positions: enriched });
});

// ─── Auth: Close position ─────────────────────────────────────────────────────
router.post("/instruments/positions/:id/close", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const posId = Number(req.params.id);

  const [pos] = await db
    .select()
    .from(instrumentPositionsTable)
    .leftJoin(instrumentsTable, eq(instrumentsTable.id, instrumentPositionsTable.instrumentId))
    .where(and(eq(instrumentPositionsTable.id, posId), eq(instrumentPositionsTable.userId, userId), eq(instrumentPositionsTable.status, "open")))
    .limit(1);

  if (!pos) { res.status(404).json({ error: "Position not found" }); return; }
  const position = pos.instrument_positions;
  const instrument = pos.instruments;
  if (!instrument) { res.status(404).json({ error: "Instrument not found" }); return; }

  const quote = await getQuote(instrument.symbol);
  if (!quote) { res.status(503).json({ error: "Price unavailable" }); return; }

  const ltp = quote.ltp;
  const entryPrice = Number(position.avgEntryPrice);
  const qty = Number(position.qty);
  const realizedPnl = position.side === "buy"
    ? (ltp - entryPrice) * qty
    : (entryPrice - ltp) * qty;
  const fee = ltp * qty * Number(instrument.takerFee);
  const netPnl = realizedPnl - fee;

  await db.update(instrumentPositionsTable).set({
    status: "closed",
    closedAt: new Date(),
    currentPrice: String(ltp),
    realizedPnl: String(netPnl),
    unrealizedPnl: "0",
  }).where(eq(instrumentPositionsTable.id, posId));

  // Credit PnL to wallet — wrapped in a transaction with FOR UPDATE.
  await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(and(
        eq(walletsTable.userId, userId),
        eq(walletsTable.walletType, "spot"),
        sql`${walletsTable.coinId} = (SELECT id FROM coins WHERE symbol = ${instrument.quoteCurrency} LIMIT 1)`,
      ))
      .for("update")
      .limit(1);
    if (!wallet) return;
    const credit = Number(position.marginUsed) + netPnl;
    const balBefore = Number(wallet.balance);
    const balAfter = Math.max(0, balBefore + credit); // for ledger only
    // SQL GREATEST(0,...) is atomic — no race condition.
    await tx.update(walletsTable).set({
      balance: sql`GREATEST(0, ${walletsTable.balance} + ${credit})`,
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, wallet.id));
    await tx.insert(walletLedgerTable).values({
      userId,
      coinId: wallet.coinId,
      walletType: "spot",
      type: "instruments_pnl",
      amount: String(credit),
      balanceBefore: String(balBefore),
      balanceAfter: String(balAfter),
      refType: "instrument_position",
      refId: String(posId),
      note: `Close ${instrument.symbol} PnL=${netPnl.toFixed(4)}`,
    });
  });

  res.json({ message: "Position closed", realizedPnl: netPnl, fee });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ─── Admin: Broker config ─────────────────────────────────────────────────────
router.get("/admin/broker-config", adminOnly, async (_req: any, res: any): Promise<void> => {
  const [cfg] = await db.select({
    id: brokerConfigTable.id,
    broker: brokerConfigTable.broker,
    apiKey: brokerConfigTable.apiKey,
    clientId: brokerConfigTable.clientId,
    enabled: brokerConfigTable.enabled,
    sandboxMode: brokerConfigTable.sandboxMode,
    lastLoginAt: brokerConfigTable.lastLoginAt,
    jwtExpiresAt: brokerConfigTable.jwtExpiresAt,
    createdAt: brokerConfigTable.createdAt,
  }).from(brokerConfigTable).limit(1);
  res.json({ config: cfg ?? null });
});

router.post("/admin/broker-config", adminOnly, async (req: any, res: any): Promise<void> => {
  const { broker, apiKey, clientId, totpSecret, enabled, sandboxMode } = req.body as {
    broker?: string; apiKey?: string; clientId?: string; totpSecret?: string; enabled?: boolean; sandboxMode?: boolean;
  };

  const [existing] = await db.select().from(brokerConfigTable).limit(1);
  if (existing) {
    await db.update(brokerConfigTable).set({
      ...(broker !== undefined && { broker }),
      ...(apiKey !== undefined && { apiKey }),
      ...(clientId !== undefined && { clientId }),
      ...(totpSecret !== undefined && { totpSecret }),
      ...(enabled !== undefined && { enabled }),
      ...(sandboxMode !== undefined && { sandboxMode }),
    }).where(eq(brokerConfigTable.id, existing.id));
  } else {
    await db.insert(brokerConfigTable).values({ broker, apiKey, clientId, totpSecret, enabled, sandboxMode });
  }
  invalidateBrokerConfigCache();
  res.json({ message: "Broker config saved" });
});

router.post("/admin/broker-config/login", adminOnly, async (req: any, res: any): Promise<void> => {
  const { password, totp } = req.body as { password: string; totp: string };
  const [cfg] = await db.select().from(brokerConfigTable).limit(1);
  if (!cfg?.clientId || !cfg?.apiKey) {
    res.status(400).json({ error: "Broker not configured" });
    return;
  }
  const tokens = await loginAngelOne({ clientId: cfg.clientId, apiKey: cfg.apiKey, password, totp });
  if (!tokens) { res.status(401).json({ error: "Angel One login failed" }); return; }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(brokerConfigTable).set({
    jwtToken: tokens.jwtToken,
    refreshToken: tokens.refreshToken,
    feedToken: tokens.feedToken,
    jwtExpiresAt: expiresAt,
    lastLoginAt: new Date(),
  }).where(eq(brokerConfigTable.id, cfg.id));
  invalidateBrokerConfigCache();
  res.json({ message: "Logged in to Angel One", expiresAt });
});

// ─── Admin: Instruments CRUD ──────────────────────────────────────────────────
router.get("/admin/instruments", adminOnly, async (req: any, res: any): Promise<void> => {
  const assetClass = String(req.query.assetClass ?? "") || null;
  let rows = await db.select().from(instrumentsTable).orderBy(asc(instrumentsTable.assetClass), asc(instrumentsTable.symbol));
  if (assetClass) rows = rows.filter((r) => r.assetClass === assetClass);
  res.json({ instruments: rows });
});

router.post("/admin/instruments", adminOnly, async (req: any, res: any): Promise<void> => {
  const data = req.body as Partial<typeof instrumentsTable.$inferInsert>;
  if (!data.symbol || !data.name || !data.assetClass) {
    res.status(400).json({ error: "symbol, name, assetClass required" });
    return;
  }
  const [inst] = await db.insert(instrumentsTable).values({
    symbol: data.symbol.toUpperCase(),
    name: data.name,
    assetClass: data.assetClass,
    exchange: data.exchange ?? "NSE",
    brokerSymbol: data.brokerSymbol,
    brokerToken: data.brokerToken,
    lotSize: data.lotSize,
    tickSize: data.tickSize,
    pricePrecision: data.pricePrecision,
    qtyPrecision: data.qtyPrecision,
    minQty: data.minQty,
    maxQty: data.maxQty,
    marginRequired: data.marginRequired,
    maxLeverage: data.maxLeverage,
    takerFee: data.takerFee,
    makerFee: data.makerFee,
    quoteCurrency: data.quoteCurrency,
    tradingEnabled: data.tradingEnabled,
    description: data.description,
    logoUrl: data.logoUrl,
    sector: data.sector,
    isin: data.isin,
    countryCode: data.countryCode,
  }).returning();
  res.json({ instrument: inst });
});

const ALLOWED_INSTRUMENT_FIELDS = new Set([
  "name","exchange","brokerSymbol","brokerToken","lotSize","tickSize","pricePrecision","qtyPrecision",
  "minQty","maxQty","marginRequired","maxLeverage","takerFee","makerFee","quoteCurrency","tradingEnabled",
  "description","logoUrl","sector","isin","countryCode","manualPrice","priceSource",
]);

router.patch("/admin/instruments/:id", adminOnly, async (req: any, res: any): Promise<void> => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (ALLOWED_INSTRUMENT_FIELDS.has(k)) updates[k] = v;
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No valid fields" }); return; }
  const [inst] = await db.update(instrumentsTable).set(updates as never).where(eq(instrumentsTable.id, id)).returning();
  if (!inst) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ instrument: inst });
});

router.delete("/admin/instruments/:id", adminOnly, async (req: any, res: any): Promise<void> => {
  const id = Number(req.params.id);
  await db.update(instrumentsTable).set({ tradingEnabled: false }).where(eq(instrumentsTable.id, id));
  res.json({ message: "Instrument disabled" });
});

export default router;
