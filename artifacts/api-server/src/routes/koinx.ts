import { Router } from "express";
import { db } from "@workspace/db";
import {
  tradesTable,
  pairsTable,
  coinsTable,
  cryptoDepositsTable,
  cryptoWithdrawalsTable,
  networksTable,
} from "@workspace/db/schema";
import { requireApiKey } from "../middlewares/api-key-auth";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const router = Router();

const querySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(1000).default(100),
  startTime: z.coerce.number().optional(),
  endTime:   z.coerce.number().optional(),
});

// ─── GET /koinx/trades ────────────────────────────────────────────────────────
router.get("/koinx/trades", requireApiKey("read"), async (req, res): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: "Invalid query params" });
    return;
  }
  const { page, limit, startTime, endTime } = parsed.data;
  const userId = req.user!.id;

  const baseCoin  = alias(coinsTable, "base_coin");
  const quoteCoin = alias(coinsTable, "quote_coin");

  const conds = [eq(tradesTable.userId, userId)];
  if (startTime) conds.push(gte(tradesTable.createdAt, new Date(startTime)));
  if (endTime)   conds.push(lte(tradesTable.createdAt, new Date(endTime)));

  const rows = await db
    .select({
      uid:         tradesTable.uid,
      side:        tradesTable.side,
      price:       tradesTable.price,
      qty:         tradesTable.qty,
      fee:         tradesTable.fee,
      tds:         tradesTable.tds,
      createdAt:   tradesTable.createdAt,
      baseSymbol:  baseCoin.symbol,
      quoteSymbol: quoteCoin.symbol,
    })
    .from(tradesTable)
    .innerJoin(pairsTable,  eq(tradesTable.pairId,       pairsTable.id))
    .innerJoin(baseCoin,    eq(pairsTable.baseCoinId,    baseCoin.id))
    .innerJoin(quoteCoin,   eq(pairsTable.quoteCoinId,   quoteCoin.id))
    .where(and(...conds))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((t) => ({
    id:            t.uid,
    timestamp:     t.createdAt.getTime(),
    symbol:        `${t.baseSymbol}/${t.quoteSymbol}`,
    side:          t.side,
    price:         t.price,
    quantity:      t.qty,
    quoteQuantity: (parseFloat(t.price) * parseFloat(t.qty)).toFixed(8),
    fee:           t.fee,
    feeCurrency:   t.quoteSymbol,
    tds:           t.tds,
  }));

  res.json({ status: "success", data, page, pageSize: limit, hasMore });
});

// ─── GET /koinx/deposits ──────────────────────────────────────────────────────
router.get("/koinx/deposits", requireApiKey("read"), async (req, res): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: "Invalid query params" });
    return;
  }
  const { page, limit, startTime, endTime } = parsed.data;
  const userId = req.user!.id;

  const conds = [eq(cryptoDepositsTable.userId, userId)];
  if (startTime) conds.push(gte(cryptoDepositsTable.createdAt, new Date(startTime)));
  if (endTime)   conds.push(lte(cryptoDepositsTable.createdAt, new Date(endTime)));

  const rows = await db
    .select({
      uid:         cryptoDepositsTable.uid,
      amount:      cryptoDepositsTable.amount,
      txHash:      cryptoDepositsTable.txHash,
      status:      cryptoDepositsTable.status,
      createdAt:   cryptoDepositsTable.createdAt,
      coinSymbol:  coinsTable.symbol,
      networkName: networksTable.name,
    })
    .from(cryptoDepositsTable)
    .innerJoin(coinsTable,    eq(cryptoDepositsTable.coinId,    coinsTable.id))
    .innerJoin(networksTable, eq(cryptoDepositsTable.networkId, networksTable.id))
    .where(and(...conds))
    .orderBy(desc(cryptoDepositsTable.createdAt))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((d) => ({
    id:          d.uid,
    timestamp:   d.createdAt.getTime(),
    currency:    d.coinSymbol,
    network:     d.networkName,
    amount:      d.amount,
    txHash:      d.txHash ?? null,
    status:      d.status,
  }));

  res.json({ status: "success", data, page, pageSize: limit, hasMore });
});

// ─── GET /koinx/withdrawals ───────────────────────────────────────────────────
router.get("/koinx/withdrawals", requireApiKey("read"), async (req, res): Promise<void> => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: "Invalid query params" });
    return;
  }
  const { page, limit, startTime, endTime } = parsed.data;
  const userId = req.user!.id;

  const conds = [eq(cryptoWithdrawalsTable.userId, userId)];
  if (startTime) conds.push(gte(cryptoWithdrawalsTable.createdAt, new Date(startTime)));
  if (endTime)   conds.push(lte(cryptoWithdrawalsTable.createdAt, new Date(endTime)));

  const rows = await db
    .select({
      uid:         cryptoWithdrawalsTable.uid,
      amount:      cryptoWithdrawalsTable.amount,
      fee:         cryptoWithdrawalsTable.fee,
      toAddress:   cryptoWithdrawalsTable.toAddress,
      txHash:      cryptoWithdrawalsTable.txHash,
      status:      cryptoWithdrawalsTable.status,
      createdAt:   cryptoWithdrawalsTable.createdAt,
      coinSymbol:  coinsTable.symbol,
      networkName: networksTable.name,
    })
    .from(cryptoWithdrawalsTable)
    .innerJoin(coinsTable,    eq(cryptoWithdrawalsTable.coinId,    coinsTable.id))
    .innerJoin(networksTable, eq(cryptoWithdrawalsTable.networkId, networksTable.id))
    .where(and(...conds))
    .orderBy(desc(cryptoWithdrawalsTable.createdAt))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((w) => ({
    id:        w.uid,
    timestamp: w.createdAt.getTime(),
    currency:  w.coinSymbol,
    network:   w.networkName,
    amount:    w.amount,
    fee:       w.fee,
    toAddress: w.toAddress,
    txHash:    w.txHash ?? null,
    status:    w.status,
  }));

  res.json({ status: "success", data, page, pageSize: limit, hasMore });
});

export default router;
