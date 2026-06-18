import { Router, type IRouter } from "express";
import { db, walletLedgerTable, coinsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/* ── GET /ledger ─────────────────────────────────────────────────────────── */
router.get("/ledger", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit  as string ?? "50", 10) || 50));
  const offset =                            parseInt(req.query.offset as string ?? "0",  10) || 0;

  const typeFilter:     string = String(req.query.type     ?? "");
  const coinFilter:     string = String(req.query.coin     ?? "").toUpperCase();
  const walletFilter:   string = String(req.query.wallet   ?? "");
  const fromDate:       string = String(req.query.from     ?? "");
  const toDate:         string = String(req.query.to       ?? "");

  const conditions = [eq(walletLedgerTable.userId, userId)] as any[];

  if (typeFilter)   conditions.push(eq(walletLedgerTable.type, typeFilter as any));
  if (walletFilter) conditions.push(eq(walletLedgerTable.walletType, walletFilter));
  if (fromDate)     conditions.push(gte(walletLedgerTable.createdAt, new Date(fromDate)));
  if (toDate)       conditions.push(lte(walletLedgerTable.createdAt, new Date(toDate + "T23:59:59.999Z")));

  let coinIdFilter: number | null = null;
  if (coinFilter) {
    const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
      .where(eq(coinsTable.symbol, coinFilter)).limit(1);
    if (coin) {
      coinIdFilter = coin.id;
      conditions.push(eq(walletLedgerTable.coinId, coin.id));
    } else {
      res.json({ entries: [], total: 0, limit, offset, summary: [] });
      return;
    }
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, [{ total }], coins] = await Promise.all([
    db.select().from(walletLedgerTable)
      .where(where)
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(limit).offset(offset),

    db.select({ total: count() }).from(walletLedgerTable).where(where),

    db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable),
  ]);

  const coinById = new Map(coins.map(c => [c.id, c.symbol]));

  res.json({
    entries: rows.map(r => ({
      id:            r.id,
      type:          r.type,
      walletType:    r.walletType,
      coin:          coinById.get(r.coinId) ?? "?",
      amount:        parseFloat(r.amount),
      balanceBefore: parseFloat(r.balanceBefore),
      balanceAfter:  parseFloat(r.balanceAfter),
      refType:       r.refType ?? null,
      refId:         r.refId   ?? null,
      note:          r.note    ?? null,
      createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
    total,
    limit,
    offset,
  });
});

/* ── GET /ledger/summary ─────────────────────────────────────────────────── */
router.get("/ledger/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  // Resolve coin IDs for INR and USDT
  const coinRows = await db
    .select({ id: coinsTable.id, symbol: coinsTable.symbol })
    .from(coinsTable)
    .where(sql`${coinsTable.symbol} IN ('INR', 'USDT')`);

  const inrCoinId  = coinRows.find(c => c.symbol === "INR")?.id  ?? -1;
  const usdtCoinId = coinRows.find(c => c.symbol === "USDT")?.id ?? -1;

  const [aiEarnings, inrCredited, inrDebited, usdtCredited, usdtDebited] = await Promise.all([
    // AI earnings (USDT coin only)
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)`, cnt: count() })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.type, "ai_earning"),
        eq(walletLedgerTable.coinId, usdtCoinId),
      )),

    // INR inflows (positive amounts, INR coin only)
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.coinId, inrCoinId),
        sql`${walletLedgerTable.amount} > 0`,
      )),

    // INR outflows (negative amounts, INR coin only)
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.coinId, inrCoinId),
        sql`${walletLedgerTable.amount} < 0`,
      )),

    // USDT inflows (positive amounts, USDT coin only)
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.coinId, usdtCoinId),
        sql`${walletLedgerTable.amount} > 0`,
      )),

    // USDT outflows (negative amounts, USDT coin only)
    db.select({ total: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(and(
        eq(walletLedgerTable.userId, userId),
        eq(walletLedgerTable.coinId, usdtCoinId),
        sql`${walletLedgerTable.amount} < 0`,
      )),
  ]);

  res.json({
    totalAiEarningsUsdt: parseFloat(aiEarnings[0]?.total ?? "0"),
    aiEarningsCount:     aiEarnings[0]?.cnt ?? 0,
    // INR-only totals (accurate ₹ figures)
    totalCreditedInr:    parseFloat(inrCredited[0]?.total  ?? "0"),
    totalDebitedInr:     Math.abs(parseFloat(inrDebited[0]?.total ?? "0")),
    // USDT totals
    totalCreditedUsdt:   parseFloat(usdtCredited[0]?.total  ?? "0"),
    totalDebitedUsdt:    Math.abs(parseFloat(usdtDebited[0]?.total ?? "0")),
  });
});

/* ── GET /ledger/export ──────────────────────────────────────────────────── */
// Returns up to 1000 rows (no pagination) for client-side PDF generation
router.get("/ledger/export", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const typeFilter:   string = String(req.query.type   ?? "");
  const coinFilter:   string = String(req.query.coin   ?? "").toUpperCase();
  const walletFilter: string = String(req.query.wallet ?? "");
  const fromDate:     string = String(req.query.from   ?? "");
  const toDate:       string = String(req.query.to     ?? "");

  const conditions = [eq(walletLedgerTable.userId, userId)] as any[];

  if (typeFilter)   conditions.push(eq(walletLedgerTable.type, typeFilter as any));
  if (walletFilter) conditions.push(eq(walletLedgerTable.walletType, walletFilter));
  if (fromDate)     conditions.push(gte(walletLedgerTable.createdAt, new Date(fromDate)));
  if (toDate)       conditions.push(lte(walletLedgerTable.createdAt, new Date(toDate + "T23:59:59.999Z")));

  if (coinFilter) {
    const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
      .where(eq(coinsTable.symbol, coinFilter)).limit(1);
    if (coin) {
      conditions.push(eq(walletLedgerTable.coinId, coin.id));
    } else {
      res.json({ entries: [] });
      return;
    }
  }

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [rows, coins] = await Promise.all([
    db.select().from(walletLedgerTable)
      .where(where)
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(1000),
    db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable),
  ]);

  const coinById = new Map(coins.map(c => [c.id, c.symbol]));

  res.json({
    entries: rows.map(r => ({
      id:            r.id,
      type:          r.type,
      walletType:    r.walletType,
      coin:          coinById.get(r.coinId) ?? "?",
      amount:        parseFloat(r.amount),
      balanceBefore: parseFloat(r.balanceBefore),
      balanceAfter:  parseFloat(r.balanceAfter),
      refType:       r.refType ?? null,
      refId:         r.refId   ?? null,
      note:          r.note    ?? null,
      createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  });
});

export default router;
