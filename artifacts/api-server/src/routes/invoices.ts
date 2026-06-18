/**
 * Invoices — full-detail tax invoice for a filled spot order (Indian compliance)
 * GET /api/orders/:id/invoice
 * Returns: fills, GST breakdown, TDS, brand details — used by Invoice.tsx page
 */
import { Router, type IRouter } from "express";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db, ordersTable, usersTable, tradesTable, pairsTable, coinsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";
import { COMPANY_NAME, COMPANY_SHORT, COMPANY_CIN, COMPANY_GST, COMPANY_PAN, COMPANY_ADDRESS, COMPANY_EMAIL, COMPANY_WEBSITE } from "../lib/company";

const router: IRouter = Router();

const GST_RATE = 0.18;  // 18% GST on trading fee (Indian regulation)
const TDS_RATE = 0.01;  // 1%  TDS on sell proceeds (Sec 194S)

router.get("/orders/:id/invoice", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, req.user!.id))).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status !== "filled" && order.status !== "partially_filled") {
    res.status(400).json({ error: "Invoice only available for filled / partially-filled orders" }); return;
  }

  // Fetch individual fills for the order
  const fills = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.orderId, id), eq(tradesTable.userId, req.user!.id)))
    .orderBy(tradesTable.createdAt);

  // Fetch pair → coin symbols
  const [pair] = order.pairId
    ? await db.select({ id: pairsTable.id, symbol: pairsTable.symbol, baseCoinId: pairsTable.baseCoinId, quoteCoinId: pairsTable.quoteCoinId })
        .from(pairsTable).where(eq(pairsTable.id, order.pairId)).limit(1)
    : [undefined];

  const [baseCoin]  = pair?.baseCoinId  ? await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.baseCoinId)).limit(1)  : [undefined];
  const [quoteCoin] = pair?.quoteCoinId ? await db.select({ symbol: coinsTable.symbol }).from(coinsTable).where(eq(coinsTable.id, pair.quoteCoinId)).limit(1) : [undefined];

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);

  const filledQty     = parseFloat(order.filledQty ?? "0");
  const avgPrice      = parseFloat(order.avgPrice ?? order.price ?? "0");
  const grossNotional = filledQty * avgPrice;

  // Fee: prefer stored order.fee; fallback to sum of fill fees; fallback to estimate
  const fillFeeSum  = fills.reduce((s, f) => s + parseFloat(f.fee ?? "0"), 0);
  const tradingFee  = parseFloat(order.fee ?? String(fillFeeSum || (grossNotional * 0.001)));
  const gstAmount   = +(tradingFee * GST_RATE).toFixed(8);
  const totalFee    = +(tradingFee + gstAmount).toFixed(8);

  // TDS: from fill rows; fallback to calculate for sell orders
  const fillTdsSum  = fills.reduce((s, f) => s + parseFloat(f.tds ?? "0"), 0);
  const tdsAmount   = +(fillTdsSum > 0 ? fillTdsSum : order.side === "sell" ? grossNotional * TDS_RATE : 0).toFixed(8);

  const netAmount   = order.side === "buy"
    ? +(grossNotional + totalFee + tdsAmount).toFixed(8)
    : +(grossNotional - totalFee - tdsAmount).toFixed(8);

  const inrRate = getInrRate();
  const toInr   = (v: number) => +(v * inrRate).toFixed(2);

  const symbol  = pair?.symbol  ?? `PAIR${order.pairId}`;
  const base    = baseCoin?.symbol  ?? "BASE";
  const quote   = quoteCoin?.symbol ?? "USDT";

  res.json({
    invoiceNo: `INV-${String(order.id).padStart(8, "0")}`,
    issuedAt:  new Date().toISOString(),
    currency:  quote,
    brand: {
      legalName:    COMPANY_NAME,
      tradingName:  COMPANY_SHORT,
      address:      COMPANY_ADDRESS,
      gstin:        COMPANY_GST,
      cin:          COMPANY_CIN,
      pan:          COMPANY_PAN,
      supportEmail: COMPANY_EMAIL,
      website:      COMPANY_WEBSITE,
    },
    customer: {
      name:   user?.name ?? user?.email ?? "Customer",
      email:  user?.email ?? "",
      userId: user?.id ?? req.user!.id,
    },
    order: {
      id:        order.id,
      symbol,
      base,
      quote,
      side:      order.side,
      type:      order.type,
      status:    order.status,
      qty:       parseFloat(order.qty),
      filledQty,
      avgPrice,
      placedAt:  order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    },
    breakdown: {
      grossNotional:  +grossNotional.toFixed(8),
      tradingFee:     +tradingFee.toFixed(8),
      gstPercent:     GST_RATE * 100,
      gstAmount:      +gstAmount.toFixed(8),
      totalFee:       +totalFee.toFixed(8),
      tdsPercent:     TDS_RATE * 100,
      tdsAmount:      +tdsAmount.toFixed(8),
      netAmount:      +netAmount.toFixed(8),
      netInr:         toInr(netAmount),
      inrRate,
      direction:      order.side === "sell" ? "credit" : "debit",
    },
    fills: fills.map(f => ({
      id:         f.id,
      uid:        f.uid,
      price:      parseFloat(f.price),
      qty:        parseFloat(f.qty),
      subtotal:   +(parseFloat(f.price) * parseFloat(f.qty)).toFixed(8),
      fee:        parseFloat(f.fee ?? "0"),
      tds:        parseFloat(f.tds ?? "0"),
      executedAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
    })),
  });
});

/* ─────────────────────── Spot Trading Statement ─────────────────────────── */
/* GET /api/orders/statement?from=YYYY-MM-DD&to=YYYY-MM-DD                    */
router.get("/orders/statement", requireAuth, async (req: any, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await getInrRate();

  const fromStr = typeof req.query.from === "string" ? req.query.from : undefined;
  const toStr   = typeof req.query.to   === "string" ? req.query.to   : undefined;
  const now     = new Date();
  const from    = fromStr ? new Date(fromStr + "T00:00:00Z") : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to      = toStr   ? new Date(toStr   + "T23:59:59Z") : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: "Invalid date range" }); return;
  }

  /* Trades in range */
  const trades = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.userId, userId), gte(tradesTable.createdAt, from), lte(tradesTable.createdAt, to)))
    .orderBy(tradesTable.createdAt);

  /* Pair + coin lookups */
  const pairIds = [...new Set(trades.map(t => t.pairId))];
  const pairs   = pairIds.length
    ? await db.select({ id: pairsTable.id, symbol: pairsTable.symbol, baseCoinId: pairsTable.baseCoinId, quoteCoinId: pairsTable.quoteCoinId })
        .from(pairsTable).where(inArray(pairsTable.id, pairIds))
    : [];
  const coinIds = [...new Set(pairs.flatMap(p => [p.baseCoinId, p.quoteCoinId].filter(Boolean) as number[]))];
  const coins   = coinIds.length
    ? await db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable).where(inArray(coinsTable.id, coinIds))
    : [];

  const pairMap = new Map(pairs.map(p => [p.id, p]));
  const coinMap = new Map(coins.map(c => [c.id, c.symbol]));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  /* Aggregate */
  let totalVolume = 0, totalFee = 0, totalTds = 0;
  const rows = trades.map(t => {
    const pair     = pairMap.get(t.pairId);
    const symbol   = pair?.symbol ?? `PAIR-${t.pairId}`;
    const base     = pair?.baseCoinId  ? (coinMap.get(pair.baseCoinId)  ?? "?") : "?";
    const quote    = pair?.quoteCoinId ? (coinMap.get(pair.quoteCoinId) ?? "?") : "?";
    const price    = parseFloat(t.price ?? "0");
    const qty      = parseFloat(t.qty   ?? "0");
    const fee      = parseFloat(t.fee   ?? "0");
    const tds      = parseFloat(t.tds   ?? "0");
    const notional = price * qty;
    totalVolume += notional; totalFee += fee; totalTds += tds;
    return {
      id: t.id, uid: t.uid, symbol, base, quote, side: t.side,
      price, qty, notional, fee, tds,
      executedAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    };
  });

  const gstAmount      = totalFee * GST_RATE;
  const totalFeeGst    = totalFee + gstAmount;
  const netDeducted    = totalFeeGst + totalTds;
  const mmYY           = `${String(from.getUTCMonth() + 1).padStart(2, "0")}${from.getUTCFullYear()}`;
  const statementNo    = `STS-${mmYY}-${String(userId).padStart(6,"0")}`;

  res.json({
    statementNo,
    generatedAt: now.toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },
    brand: {
      legalName: COMPANY_NAME, tradingName: COMPANY_SHORT,
      address: COMPANY_ADDRESS, gstin: COMPANY_GST, cin: COMPANY_CIN,
      pan: COMPANY_PAN, supportEmail: COMPANY_EMAIL, website: COMPANY_WEBSITE,
    },
    customer: { name: user?.name ?? user?.email ?? "User", email: user?.email ?? "", userId },
    summary: {
      totalTrades: trades.length,
      totalVolumeUsdt: totalVolume, totalVolumeInr: totalVolume * inrRate,
      tradingFee: totalFee, gstPercent: GST_RATE * 100, gstAmount,
      totalFeeWithGst: totalFeeGst, tdsPercent: TDS_RATE * 100,
      totalTds, netDeducted, inrRate,
    },
    trades: rows,
  });
});

export default router;
