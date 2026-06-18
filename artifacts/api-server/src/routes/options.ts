/**
 * Options trading — user-facing routes.
 *
 *   GET  /options/contracts                  — list active contracts (filterable)
 *   GET  /options/contracts/:symbol/quote    — live mark + greeks
 *   POST /options/orders                     — buy/sell at mark (market only)
 *   GET  /options/positions                  — caller's open positions w/ live PnL
 *   POST /options/positions/:id/close        — close a position at current mark
 *   GET  /options/orders/history             — caller's filled orders (paginated)
 *
 * Pricing is server-authoritative — the client never tells us what to charge.
 * Buy debits user's USDT spot wallet; sell-to-open locks USDT collateral as
 * margin. All wallet movements use SELECT FOR UPDATE inside a transaction so
 * concurrent orders can't double-spend.
 */
import { Router, type IRouter } from "express";
import { and, eq, gt, desc, sql, inArray } from "drizzle-orm";
import { db, optionContractsTable, optionOrdersTable, optionPositionsTable, coinsTable, walletsTable, walletLedgerTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { priceOption, bpsToDec, yearsTo } from "../lib/options-pricing";

const router: IRouter = Router();

const SETTLEMENT_FEE_BPS = 10; // 0.10% taker fee on premium

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getSpotForContract(c: { underlyingCoinId: number }): Promise<number> {
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.id, c.underlyingCoinId)).limit(1);
  if (!coin) return 0;
  const live = Number(coin.currentPrice);
  if (live > 0) return live;
  const m = coin.manualPrice ? Number(coin.manualPrice) : 0;
  return m;
}

async function priceContract(c: typeof optionContractsTable.$inferSelect) {
  const spot = await getSpotForContract(c);
  const greeks = priceOption(
    spot,
    Number(c.strikePrice),
    yearsTo(c.expiryAt),
    bpsToDec(c.ivBps),
    bpsToDec(c.riskFreeRateBps),
    c.optionType as "call" | "put",
  );
  return { spot, greeks };
}

// ─── List active contracts ───────────────────────────────────────────────────
router.get("/options/contracts", async (req, res): Promise<void> => {
  const underlyingSymbol = String(req.query.underlying ?? "").toUpperCase();
  let coinId: number | null = null;
  if (underlyingSymbol) {
    const [c] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, underlyingSymbol)).limit(1);
    if (!c) { res.json({ contracts: [] }); return; }
    coinId = c.id;
  }

  const where = coinId
    ? and(eq(optionContractsTable.status, "active"), eq(optionContractsTable.underlyingCoinId, coinId), gt(optionContractsTable.expiryAt, new Date()))
    : and(eq(optionContractsTable.status, "active"), gt(optionContractsTable.expiryAt, new Date()));

  const rows = await db.select().from(optionContractsTable).where(where).orderBy(optionContractsTable.expiryAt, optionContractsTable.strikePrice);

  // Cache underlying prices to avoid N+1
  const coinIds = [...new Set(rows.map((r) => r.underlyingCoinId))];
  const coinRows = coinIds.length
    ? await db.select().from(coinsTable).where(inArray(coinsTable.id, coinIds))
    : [];
  const priceById = new Map<number, { symbol: string; price: number }>();
  for (const c of coinRows) priceById.set(c.id, { symbol: c.symbol, price: Number(c.currentPrice) || Number(c.manualPrice ?? 0) });

  const contracts = rows.map((r) => {
    const u = priceById.get(r.underlyingCoinId);
    const spot = u?.price ?? 0;
    const g = priceOption(spot, Number(r.strikePrice), yearsTo(r.expiryAt), bpsToDec(r.ivBps), bpsToDec(r.riskFreeRateBps), r.optionType as "call" | "put");
    return {
      id: r.id,
      symbol: r.symbol,
      underlyingSymbol: u?.symbol ?? "",
      optionType: r.optionType,
      strike: Number(r.strikePrice),
      expiryAt: r.expiryAt,
      iv: bpsToDec(r.ivBps),
      contractSize: Number(r.contractSize),
      minQty: Number(r.minQty),
      mark: g.mark,
      delta: g.delta,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
      spot,
      intrinsic: g.intrinsic,
      timeValue: g.timeValue,
    };
  });

  res.json({ contracts });
});

// ─── Live quote for a single contract ────────────────────────────────────────
router.get("/options/contracts/:symbol/quote", async (req, res): Promise<void> => {
  const sym = String(req.params.symbol);
  const [c] = await db.select().from(optionContractsTable).where(eq(optionContractsTable.symbol, sym)).limit(1);
  if (!c) { res.status(404).json({ error: "contract not found" }); return; }
  const { spot, greeks } = await priceContract(c);
  res.json({
    symbol: c.symbol,
    optionType: c.optionType,
    strike: Number(c.strikePrice),
    expiryAt: c.expiryAt,
    status: c.status,
    spot,
    iv: bpsToDec(c.ivBps),
    ...greeks,
  });
});

// ─── Place an order (market-only against live mark) ──────────────────────────
router.post("/options/orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { contractId, side, qty } = req.body ?? {};
  const cId = Number(contractId);
  const q = Number(qty);
  if (!Number.isFinite(cId) || cId <= 0) { res.status(400).json({ error: "contractId required" }); return; }
  if (side !== "buy" && side !== "sell") { res.status(400).json({ error: "side must be 'buy' or 'sell'" }); return; }
  if (!Number.isFinite(q) || q <= 0) { res.status(400).json({ error: "qty must be positive" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [c] = await tx.select().from(optionContractsTable).where(eq(optionContractsTable.id, cId)).limit(1);
      if (!c) { const e: any = new Error("contract not found"); e.code = 404; throw e; }
      if (c.status !== "active") { const e: any = new Error(`contract is ${c.status}`); e.code = 400; throw e; }
      if (new Date(c.expiryAt).getTime() <= Date.now()) { const e: any = new Error("contract has expired"); e.code = 400; throw e; }
      if (q < Number(c.minQty)) { const e: any = new Error(`min qty is ${c.minQty}`); e.code = 400; throw e; }

      const { spot, greeks } = await priceContract(c);
      if (spot <= 0 || greeks.mark <= 0) { const e: any = new Error("mark price unavailable, try again"); e.code = 503; throw e; }

      const premium = greeks.mark * q * Number(c.contractSize);
      const fee = premium * (SETTLEMENT_FEE_BPS / 10000);

      // Locate quote-currency wallet (USDT by default)
      const [quoteCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, c.quoteCoinSymbol)).limit(1);
      if (!quoteCoin) { const e: any = new Error(`quote coin ${c.quoteCoinSymbol} missing`); e.code = 500; throw e; }

      const [w] = await tx.select().from(walletsTable).where(
        and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, quoteCoin.id), eq(walletsTable.walletType, "spot")),
      ).for("update").limit(1);
      if (!w) { const e: any = new Error(`No ${c.quoteCoinSymbol} spot wallet — please deposit first`); e.code = 400; throw e; }

      // Buy = pay premium + fee (debit balance, no margin lock, get long position)
      // Sell = collect premium - fee (credit balance), but lock collateral = strike*qty for protection
      const positionSide: "long" | "short" = side === "buy" ? "long" : "short";
      let marginToLock = 0;
      let cashDelta = 0; // signed: positive = credit, negative = debit

      if (side === "buy") {
        const cost = premium + fee;
        if (Number(w.balance) < cost) { const e: any = new Error(`Insufficient ${c.quoteCoinSymbol} (need ${cost.toFixed(2)})`); e.code = 400; throw e; }
        cashDelta = -cost;
      } else {
        // Conservative collateral: cover worst-case payoff. For calls = 100% of (spot * qty); for puts = strike * qty.
        marginToLock = c.optionType === "call"
          ? Math.max(spot, Number(c.strikePrice)) * q * Number(c.contractSize)
          : Number(c.strikePrice) * q * Number(c.contractSize);
        if (Number(w.balance) < marginToLock) { const e: any = new Error(`Insufficient ${c.quoteCoinSymbol} for margin (need ${marginToLock.toFixed(2)})`); e.code = 400; throw e; }
        cashDelta = premium - fee;
      }

      // Apply wallet move atomically
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${cashDelta - marginToLock}`,
        locked:  sql`${walletsTable.locked}  + ${marginToLock}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));

      // Insert order row
      const [order] = await tx.insert(optionOrdersTable).values({
        userId, contractId: cId, side, qty: String(q), premium: String(premium),
        markPriceAtFill: String(greeks.mark), fee: String(fee), status: "FILLED",
      }).returning();
      const optNetCash = cashDelta - marginToLock;
      await tx.insert(walletLedgerTable).values({
        userId, coinId: quoteCoin.id, walletType: "spot", type: "options_pnl",
        amount: optNetCash.toFixed(8),
        balanceBefore: w.balance,
        balanceAfter: (Number(w.balance) + optNetCash).toFixed(8),
        refType: "option_order", refId: String(order.id),
        note: `Options ${side} fill — premium=${premium.toFixed(8)}, fee=${fee.toFixed(8)}`,
      });

      // Upsert position (one open row per (user, contract, side))
      const [existing] = await tx.select().from(optionPositionsTable).where(
        and(
          eq(optionPositionsTable.userId, userId),
          eq(optionPositionsTable.contractId, cId),
          eq(optionPositionsTable.side, positionSide),
          eq(optionPositionsTable.status, "open"),
        ),
      ).for("update").limit(1);

      let position;
      if (existing) {
        const newQty = Number(existing.qty) + q;
        const newAvg = (Number(existing.avgEntryPremium) * Number(existing.qty) + greeks.mark * q) / newQty;
        const [u] = await tx.update(optionPositionsTable).set({
          qty: String(newQty),
          avgEntryPremium: String(newAvg),
          marginLocked: sql`${optionPositionsTable.marginLocked} + ${marginToLock}`,
        }).where(eq(optionPositionsTable.id, existing.id)).returning();
        position = u;
      } else {
        const [ins] = await tx.insert(optionPositionsTable).values({
          userId, contractId: cId, side: positionSide, qty: String(q),
          avgEntryPremium: String(greeks.mark), marginLocked: String(marginToLock),
        }).returning();
        position = ins;
      }

      return { order, position, mark: greeks.mark, premium, fee };
    });

    res.status(201).json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── Caller's open positions with live PnL/greeks ────────────────────────────
router.get("/options/positions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const positions = await db.select().from(optionPositionsTable).where(
    and(eq(optionPositionsTable.userId, userId), eq(optionPositionsTable.status, "open")),
  ).orderBy(desc(optionPositionsTable.openedAt));

  const out: any[] = [];
  for (const p of positions) {
    const [c] = await db.select().from(optionContractsTable).where(eq(optionContractsTable.id, p.contractId)).limit(1);
    if (!c) continue;
    const { spot, greeks } = await priceContract(c);
    const qty = Number(p.qty);
    const sizeMul = qty * Number(c.contractSize);
    const entry = Number(p.avgEntryPremium);
    const unrealized = p.side === "long"
      ? (greeks.mark - entry) * sizeMul
      : (entry - greeks.mark) * sizeMul;
    out.push({
      id: p.id,
      contractId: p.contractId,
      symbol: c.symbol,
      optionType: c.optionType,
      strike: Number(c.strikePrice),
      expiryAt: c.expiryAt,
      side: p.side,
      qty,
      avgEntryPremium: entry,
      marginLocked: Number(p.marginLocked),
      mark: greeks.mark,
      spot,
      delta: p.side === "long" ? greeks.delta : -greeks.delta,
      gamma: p.side === "long" ? greeks.gamma : -greeks.gamma,
      theta: p.side === "long" ? greeks.theta : -greeks.theta,
      vega:  p.side === "long" ? greeks.vega  : -greeks.vega,
      unrealizedPnl: unrealized,
      openedAt: p.openedAt,
    });
  }

  res.json({ positions: out });
});

// ─── Close an open position at current mark ──────────────────────────────────
router.post("/options/positions/:id/close", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(optionPositionsTable).where(
        and(eq(optionPositionsTable.id, id), eq(optionPositionsTable.userId, userId)),
      ).for("update").limit(1);
      if (!p) { const e: any = new Error("position not found"); e.code = 404; throw e; }
      if (p.status !== "open") { const e: any = new Error(`position is ${p.status}`); e.code = 400; throw e; }

      const [c] = await tx.select().from(optionContractsTable).where(eq(optionContractsTable.id, p.contractId)).limit(1);
      if (!c) { const e: any = new Error("contract gone"); e.code = 404; throw e; }
      const { spot, greeks } = await priceContract(c);
      if (spot <= 0) { const e: any = new Error("mark unavailable"); e.code = 503; throw e; }

      const qty = Number(p.qty);
      const sizeMul = qty * Number(c.contractSize);
      const entry = Number(p.avgEntryPremium);
      const closeNotional = greeks.mark * sizeMul;
      const fee = closeNotional * (SETTLEMENT_FEE_BPS / 10000);
      const margin = Number(p.marginLocked);

      // PnL realized at close
      const pnl = p.side === "long"
        ? (greeks.mark - entry) * sizeMul - fee
        : (entry - greeks.mark) * sizeMul - fee;

      const [quoteCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, c.quoteCoinSymbol)).limit(1);
      if (!quoteCoin) { const e: any = new Error("quote coin missing"); e.code = 500; throw e; }
      const [w] = await tx.select().from(walletsTable).where(
        and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, quoteCoin.id), eq(walletsTable.walletType, "spot")),
      ).for("update").limit(1);
      if (!w) { const e: any = new Error("quote wallet missing"); e.code = 500; throw e; }

      // Long close: receive (mark - entry) * size - fee. Already paid premium up front, so just add net PnL.
      // Short close: unlock margin, apply PnL (could be negative).
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${margin + pnl}`,
        locked:  sql`${walletsTable.locked}  - ${margin}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
      await tx.insert(walletLedgerTable).values({
        userId, coinId: quoteCoin.id, walletType: "spot", type: "options_pnl",
        amount: (margin + pnl).toFixed(8),
        balanceBefore: w.balance,
        balanceAfter: (Number(w.balance) + margin + pnl).toFixed(8),
        refType: "option_position", refId: String(p.id),
        note: `Options close — margin=${margin.toFixed(8)}, pnl=${pnl.toFixed(8)}`,
      });

      await tx.update(optionPositionsTable).set({
        status: "closed",
        closedAt: new Date(),
        closeReason: "user_close",
        marginLocked: "0",
        realizedPnl: String(pnl),
      }).where(eq(optionPositionsTable.id, p.id));

      // Record close as an opposite-side order for history
      await tx.insert(optionOrdersTable).values({
        userId, contractId: c.id, side: p.side === "long" ? "sell" : "buy",
        qty: String(qty), premium: String(closeNotional),
        markPriceAtFill: String(greeks.mark), fee: String(fee), status: "FILLED",
      });

      return { positionId: p.id, mark: greeks.mark, pnl, fee };
    });
    res.json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── Caller's order history ──────────────────────────────────────────────────
router.get("/options/orders/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  const rows = await db.select({
    id: optionOrdersTable.id,
    contractId: optionOrdersTable.contractId,
    side: optionOrdersTable.side,
    qty: optionOrdersTable.qty,
    premium: optionOrdersTable.premium,
    markPriceAtFill: optionOrdersTable.markPriceAtFill,
    fee: optionOrdersTable.fee,
    status: optionOrdersTable.status,
    createdAt: optionOrdersTable.createdAt,
    contractSymbol: optionContractsTable.symbol,
    optionType: optionContractsTable.optionType,
    strike: optionContractsTable.strikePrice,
    expiryAt: optionContractsTable.expiryAt,
  }).from(optionOrdersTable)
    .innerJoin(optionContractsTable, eq(optionContractsTable.id, optionOrdersTable.contractId))
    .where(eq(optionOrdersTable.userId, userId))
    .orderBy(desc(optionOrdersTable.createdAt))
    .limit(limit);
  res.json({ orders: rows });
});

export default router;
