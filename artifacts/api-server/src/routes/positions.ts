import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, futuresPositionsTable, pairsTable, walletsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/positions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const status = (req.query.status as string) || "open";
  const rows = status === "all"
    ? await db.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.userId, userId)).orderBy(desc(futuresPositionsTable.openedAt)).limit(200)
    : await db.select().from(futuresPositionsTable).where(and(eq(futuresPositionsTable.userId, userId), eq(futuresPositionsTable.status, status))).orderBy(desc(futuresPositionsTable.openedAt)).limit(200);
  res.json(rows);
});

function calcLiqPrice(side: string, entry: number, qty: number, margin: number, mm: number): number {
  // Closed-form isolated liq price
  if (side === "long") return Math.max(0, (entry * qty - margin) / (qty * (1 - mm)));
  return (entry * qty + margin) / (qty * (1 + mm));
}

router.post("/positions/open", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { pairId, side, leverage, qty, marginType } = req.body ?? {};
  if (!pairId || !["long","short"].includes(side)) { res.status(400).json({ error: "pairId, side(long/short) required" }); return; }
  const lev = Math.max(1, Math.min(125, Number(leverage ?? 10)));
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) { res.status(400).json({ error: "qty must be positive" }); return; }

  try {
    const created = await db.transaction(async (tx) => {
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, Number(pairId))).limit(1);
      if (!pair) { const e: any = new Error("Pair not found"); e.code = 404; throw e; }
      if (!pair.futuresEnabled) { const e: any = new Error("Futures not enabled for this pair"); e.code = 400; throw e; }
      if (pair.futuresStartAt && pair.futuresStartAt.getTime() > Date.now()) { const e: any = new Error("Futures not yet started"); e.code = 400; throw e; }
      if (lev > (pair.maxLeverage ?? 100)) { const e: any = new Error(`Max leverage is ${pair.maxLeverage}x`); e.code = 400; throw e; }

      const entry = Number(pair.lastPrice);
      if (!Number.isFinite(entry) || entry <= 0) { const e: any = new Error("Mark price unavailable"); e.code = 400; throw e; }
      const notional = entry * qtyNum;
      const margin = notional / lev;
      const mm = Number(pair.mmRate ?? 0.005);
      const liqPrice = calcLiqPrice(side, entry, qtyNum, margin, mm);

      // Lock margin from futures wallet (quote coin)
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, pair.quoteCoinId), eq(walletsTable.walletType, "futures")))
        .for("update").limit(1);
      let walletId: number;
      if (!w) {
        const [created] = await tx.insert(walletsTable).values({
          userId, coinId: pair.quoteCoinId, walletType: "futures", balance: "0", locked: "0",
        }).returning();
        walletId = created.id;
      } else { walletId = w.id; }
      const [walletLocked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, walletId)).for("update").limit(1);
      const bal = Number(walletLocked.balance);
      if (bal < margin) { const e: any = new Error(`Insufficient futures margin (have ${bal.toFixed(8)}, need ${margin.toFixed(8)})`); e.code = 400; throw e; }
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${margin}`,
        locked: sql`${walletsTable.locked} + ${margin}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, walletId));

      const [pos] = await tx.insert(futuresPositionsTable).values({
        userId, pairId: pair.id, side, leverage: lev, qty: String(qtyNum),
        entryPrice: String(entry), markPrice: String(entry),
        marginAmount: String(margin), marginType: marginType === "cross" ? "cross" : "isolated",
        liquidationPrice: String(liqPrice), status: "open",
      }).returning();
      return pos;
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.post("/positions/:id/close", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  try {
    const closed = await db.transaction(async (tx) => {
      const [pos] = await tx.select().from(futuresPositionsTable)
        .where(and(eq(futuresPositionsTable.id, id), eq(futuresPositionsTable.userId, userId)))
        .for("update").limit(1);
      if (!pos) { const e: any = new Error("Position not found"); e.code = 404; throw e; }
      if (pos.status !== "open") { const e: any = new Error(`Cannot close — status is ${pos.status}`); e.code = 400; throw e; }
      const [pair] = await tx.select().from(pairsTable).where(eq(pairsTable.id, pos.pairId)).limit(1);
      if (!pair) { const e: any = new Error("Pair missing"); e.code = 500; throw e; }
      const exit = Number(pair.lastPrice);
      if (!Number.isFinite(exit) || exit <= 0) { const e: any = new Error("Mark price unavailable"); e.code = 400; throw e; }
      const entry = Number(pos.entryPrice), qty = Number(pos.qty), margin = Number(pos.marginAmount);
      const pnl = pos.side === "long" ? (exit - entry) * qty : (entry - exit) * qty;
      const credit = Math.max(0, margin + pnl);

      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, pair.quoteCoinId), eq(walletsTable.walletType, "futures")))
        .for("update").limit(1);
      if (w) {
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${credit}`,
          locked: sql`${walletsTable.locked} - ${margin}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
      }
      const [updated] = await tx.update(futuresPositionsTable).set({
        status: "closed", closedAt: new Date(), closeReason: "user_close",
        markPrice: String(exit), realizedPnl: String(pnl), unrealizedPnl: "0",
      }).where(eq(futuresPositionsTable.id, id)).returning();
      return updated;
    });
    res.json(closed);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
