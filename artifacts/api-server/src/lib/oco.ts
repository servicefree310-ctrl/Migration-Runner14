/**
 * OCO (One-Cancels-Other) helpers.
 *
 * SL + PL bracket orders share an ocoGroupId.  When either fills, the engine
 * calls cancelOcoPartners() to cancel the remaining leg.
 *
 * Deliberately isolated from orders.ts and matching-engine.ts to avoid the
 * circular import that would arise if both imported each other.
 */

import { eq, and, or, ne, sql } from "drizzle-orm";
import { db, ordersTable, walletsTable, pairsTable, coinsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { rZrem, rDel, rPublish } from "./redis";
import { getSpotFeeRates } from "../routes/fees";

async function ensureWalletTx(tx: any, userId: number, coinId: number, walletType: string) {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
    .for("update").limit(1);
  if (w) return w;
  const [c] = await tx.insert(walletsTable).values({ userId, coinId, walletType, balance: "0", locked: "0" }).returning();
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, c.id)).for("update").limit(1);
  return locked;
}

async function cancelOneLeg(order: any): Promise<{ symbol: string; order: any } | null> {
  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, order.id))
      .for("update").limit(1);
    if (!fresh) return null;
    const s = fresh.status;
    if (s !== "open" && s !== "partial" && s !== "pending_trigger") return null;

    const [pair] = await tx.select().from(pairsTable)
      .where(eq(pairsTable.id, fresh.pairId)).limit(1);

    if (!Number(fresh.noLock) && pair) {
      const remainingQty = Number(fresh.qty) - Number(fresh.filledQty ?? 0);
      if (remainingQty > 1e-8) {
        const pairCoins = await tx.select({ id: coinsTable.id, symbol: coinsTable.symbol })
          .from(coinsTable)
          .where(or(eq(coinsTable.id, pair.baseCoinId), eq(coinsTable.id, pair.quoteCoinId)));
        const quoteSymbol = pairCoins.find((c: any) => c.id === pair.quoteCoinId)?.symbol;
        const quoteWt = quoteSymbol === "INR" ? "inr" : "spot";

        if (fresh.side === "sell") {
          const w = await ensureWalletTx(tx, fresh.userId, pair.baseCoinId, "spot");
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${remainingQty}`,
            locked:  sql`${walletsTable.locked}  - ${remainingQty}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        } else {
          const [userRow] = await tx.select({ vipTier: usersTable.vipTier })
            .from(usersTable).where(eq(usersTable.id, fresh.userId)).limit(1);
          const fees = await getSpotFeeRates(userRow?.vipTier ?? 0);
          const refund = remainingQty * Number(fresh.price) * (1 + fees.taker);
          const w = await ensureWalletTx(tx, fresh.userId, pair.quoteCoinId, quoteWt);
          await tx.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${refund}`,
            locked:  sql`${walletsTable.locked}  - ${refund}`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        }
      }
    }

    const newStatus = Number(fresh.filledQty ?? 0) > 0 ? "partial_cancelled" : "cancelled";
    const [updated] = await tx.update(ordersTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(ordersTable.id, fresh.id))
      .returning();
    return { symbol: pair?.symbol ?? `pair-${fresh.pairId}`, order: updated };
  });
}

/**
 * Cancel all open / partial / pending_trigger legs of an OCO group except the
 * one that just filled or was manually cancelled (exceptOrderId).
 */
export async function cancelOcoPartners(ocoGroupId: string | null | undefined, exceptOrderId: number): Promise<void> {
  if (!ocoGroupId) return;
  const partners = await db.select({
    id: ordersTable.id, status: ordersTable.status,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.ocoGroupId, ocoGroupId),
      ne(ordersTable.id, exceptOrderId),
    ));

  for (const partner of partners) {
    const s = partner.status;
    if (s !== "open" && s !== "partial" && s !== "pending_trigger") continue;
    try {
      const result = await cancelOneLeg(partner);
      if (result) {
        const { symbol, order } = result;
        if (order.type === "limit" || order.type === "post_only") {
          await rZrem(`orderbook:${symbol}:${order.side}`, String(order.id));
          await rDel(`orderbook:${symbol}:order:${order.id}`);
        }
        await rPublish(`orders.${symbol}`, { action: "cancel", order: { id: order.id, status: order.status, ocoGroupId } });
        await rPublish(`orders.user.${order.userId}`, { action: "cancel", order: { id: order.id, status: order.status, ocoGroupId } });
      }
    } catch (e) {
      logger.warn({ err: e, orderId: partner.id, ocoGroupId }, "OCO partner cancel failed");
    }
  }
}
