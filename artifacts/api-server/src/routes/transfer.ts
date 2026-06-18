import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, walletsTable, coinsTable, transfersTable, walletLedgerTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const ALLOWED_WALLETS = ["spot", "futures", "earn", "inr"] as const;

router.get("/transfers", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(transfersTable).where(eq(transfersTable.userId, req.user!.id)).orderBy(desc(transfersTable.createdAt)).limit(100);
  res.json(rows);
});

router.post("/transfer", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { fromWallet, toWallet, coinSymbol, amount } = req.body ?? {};
  if (!ALLOWED_WALLETS.includes(fromWallet) || !ALLOWED_WALLETS.includes(toWallet)) {
    res.status(400).json({ error: "fromWallet/toWallet must be one of spot/futures/earn/inr" }); return;
  }
  if (fromWallet === toWallet) { res.status(400).json({ error: "from and to must differ" }); return; }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }
  if (!coinSymbol) { res.status(400).json({ error: "coinSymbol required" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [coin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, String(coinSymbol).toUpperCase())).limit(1);
      if (!coin) { const e: any = new Error("Coin not found"); e.code = 404; throw e; }
      // INR wallet must hold INR coin
      if ((fromWallet === "inr" || toWallet === "inr") && coin.symbol !== "INR") {
        const e: any = new Error("INR wallet only holds INR"); e.code = 400; throw e;
      }
      const [src] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, fromWallet)))
        .for("update").limit(1);
      if (!src) { const e: any = new Error(`No ${fromWallet} wallet for ${coin.symbol}`); e.code = 400; throw e; }
      if (Number(src.balance) < amt) { const e: any = new Error(`Insufficient balance in ${fromWallet} (have ${Number(src.balance).toFixed(8)})`); e.code = 400; throw e; }

      // Ensure destination wallet
      const [dstExisting] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, toWallet)))
        .for("update").limit(1);
      let dstId: number;
      if (dstExisting) dstId = dstExisting.id;
      else {
        const [c] = await tx.insert(walletsTable).values({ userId, coinId: coin.id, walletType: toWallet, balance: "0", locked: "0" }).returning();
        dstId = c.id;
      }

      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${amt}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, src.id));
      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date(),
      }).where(eq(walletsTable.id, dstId));

      const [trf] = await tx.insert(transfersTable).values({
        userId, fromWallet, toWallet, coinId: coin.id, amount: String(amt), status: "completed",
      }).returning();

      // Write wallet ledger: one debit (transfer_out) + one credit (transfer_in)
      const srcBalBefore = parseFloat(src.balance ?? "0");
      const dstBalBefore = parseFloat(dstExisting?.balance ?? "0");
      const note = `${fromWallet} → ${toWallet}`;
      await tx.insert(walletLedgerTable).values([
        {
          userId, coinId: coin.id, walletType: fromWallet,
          type: "transfer_out", amount: String(-amt),
          balanceBefore: String(srcBalBefore),
          balanceAfter: String(srcBalBefore - amt),
          refType: "transfer", refId: String(trf.id),
          note,
        },
        {
          userId, coinId: coin.id, walletType: toWallet,
          type: "transfer_in", amount: String(amt),
          balanceBefore: String(dstBalBefore),
          balanceAfter: String(dstBalBefore + amt),
          refType: "transfer", refId: String(trf.id),
          note,
        },
      ]);

      return trf;
    });
    res.status(201).json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
