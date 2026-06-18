/**
 * Copy Trading Engine
 *
 * Triggered (fire-and-forget) whenever a master trader's spot order fills.
 * For each active follower:
 *   1. Scale the qty proportionally to their allocation + copyRatio
 *   2. Cap by maxRiskPerTradePct
 *   3. Check wallet balance
 *   4. Execute: debit/credit wallets, insert order + trade record
 *   5. Update copy_relations stats (totalCopiedTrades)
 *   6. Update master trader profile (totalTrades)
 */
import { randomUUID } from "node:crypto";
import {
  db,
  traderProfilesTable,
  copyRelationsTable,
  walletsTable,
  ordersTable,
  tradesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface CopyFillEvent {
  pairId: number;
  side: "buy" | "sell";
  filledQty: number;
  price: number;
  baseCoinId: number;
  quoteCoinId: number;
}

const COPY_FEE_RATE = 0.001;       // 0.1% taker fee charged on copy trades
const MIN_NOTIONAL_USDT = 5;       // Skip copy if notional < $5
const MAX_FOLLOWERS_PER_CALL = 50; // Safety limit

export async function triggerCopyTrades(
  masterUserId: number,
  fill: CopyFillEvent,
): Promise<void> {
  // 1. Find active trader profile
  const [profile] = await db
    .select()
    .from(traderProfilesTable)
    .where(
      and(
        eq(traderProfilesTable.userId, masterUserId),
        eq(traderProfilesTable.isActive, true),
      ),
    )
    .limit(1);

  if (!profile) return; // caller is not a copy-trading master

  // 2. Load active copy relations
  const relations = await db
    .select()
    .from(copyRelationsTable)
    .where(
      and(
        eq(copyRelationsTable.traderId, profile.id),
        eq(copyRelationsTable.status, "active"),
      ),
    )
    .limit(MAX_FOLLOWERS_PER_CALL);

  if (relations.length === 0) return;

  const masterAum = Math.max(Number(profile.aumUsd) || 1, 1);

  // 3. Copy for each follower (parallel, fail-safe)
  const results = await Promise.allSettled(
    relations.map((rel) => executeCopyTrade(rel, fill, masterAum)),
  );

  const successes = results.filter(
    (r) => r.status === "fulfilled" && r.value === true,
  ).length;

  for (const r of results) {
    if (r.status === "rejected") {
      logger.error({ err: r.reason }, "copy-engine: follower copy error");
    }
  }

  // 4. Update master stats
  if (successes > 0) {
    await db
      .update(traderProfilesTable)
      .set({
        totalTrades: sql`${traderProfilesTable.totalTrades} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(traderProfilesTable.id, profile.id));
  }

  if (successes > 0) {
    logger.info(
      { masterUserId, traderId: profile.id, successes, total: relations.length },
      "copy-engine: trades mirrored",
    );
  }
}

async function executeCopyTrade(
  rel: typeof copyRelationsTable.$inferSelect,
  fill: CopyFillEvent,
  masterAum: number,
): Promise<boolean> {
  const alloc   = Number(rel.allocationUsd);
  const ratio   = Number(rel.copyRatio);
  const maxRisk = Number(rel.maxRiskPerTradePct);

  // Scale qty: proportional to follower's share of master AUM × ratio
  const scaleFactor = (alloc / masterAum) * ratio;
  let scaledQty = fill.filledQty * scaleFactor;

  // Cap by max risk per trade
  const maxNotional = alloc * (maxRisk / 100);
  const capQty = maxNotional / fill.price;
  scaledQty = Math.min(scaledQty, capQty);

  const notional = scaledQty * fill.price;
  if (notional < MIN_NOTIONAL_USDT) return false; // too small

  // Round to 8 decimal places
  scaledQty = Math.round(scaledQty * 1e8) / 1e8;
  if (scaledQty <= 0) return false;

  const fee = Math.round(notional * COPY_FEE_RATE * 1e8) / 1e8;

  try {
    await db.transaction(async (tx) => {
      if (fill.side === "buy") {
        // Follower BUY: spend quote (USDT+fee), receive base
        const cost = notional + fee;

        const [qw] = await tx
          .select()
          .from(walletsTable)
          .where(
            and(
              eq(walletsTable.userId, rel.followerId),
              eq(walletsTable.coinId, fill.quoteCoinId),
              eq(walletsTable.walletType, "spot"),
            ),
          )
          .for("update")
          .limit(1);

        if (!qw || Number(qw.balance) < cost) {
          throw new Error("insufficient_balance");
        }

        await tx
          .update(walletsTable)
          .set({ balance: sql`${walletsTable.balance} - ${cost}`, updatedAt: new Date() })
          .where(eq(walletsTable.id, qw.id));

        // Credit base wallet (upsert)
        const [bw] = await tx
          .select()
          .from(walletsTable)
          .where(
            and(
              eq(walletsTable.userId, rel.followerId),
              eq(walletsTable.coinId, fill.baseCoinId),
              eq(walletsTable.walletType, "spot"),
            ),
          )
          .limit(1);

        if (bw) {
          await tx
            .update(walletsTable)
            .set({ balance: sql`${walletsTable.balance} + ${scaledQty}`, updatedAt: new Date() })
            .where(eq(walletsTable.id, bw.id));
        } else {
          await tx.insert(walletsTable).values({
            userId: rel.followerId,
            coinId: fill.baseCoinId,
            walletType: "spot",
            balance: String(scaledQty),
            locked: "0",
          });
        }
      } else {
        // Follower SELL: spend base, receive quote (USDT − fee)
        const received = notional - fee;

        const [bw] = await tx
          .select()
          .from(walletsTable)
          .where(
            and(
              eq(walletsTable.userId, rel.followerId),
              eq(walletsTable.coinId, fill.baseCoinId),
              eq(walletsTable.walletType, "spot"),
            ),
          )
          .for("update")
          .limit(1);

        if (!bw || Number(bw.balance) < scaledQty) {
          throw new Error("insufficient_balance");
        }

        await tx
          .update(walletsTable)
          .set({ balance: sql`${walletsTable.balance} - ${scaledQty}`, updatedAt: new Date() })
          .where(eq(walletsTable.id, bw.id));

        // Credit quote wallet (upsert)
        const [qw] = await tx
          .select()
          .from(walletsTable)
          .where(
            and(
              eq(walletsTable.userId, rel.followerId),
              eq(walletsTable.coinId, fill.quoteCoinId),
              eq(walletsTable.walletType, "spot"),
            ),
          )
          .limit(1);

        if (qw) {
          await tx
            .update(walletsTable)
            .set({ balance: sql`${walletsTable.balance} + ${received}`, updatedAt: new Date() })
            .where(eq(walletsTable.id, qw.id));
        } else {
          await tx.insert(walletsTable).values({
            userId: rel.followerId,
            coinId: fill.quoteCoinId,
            walletType: "spot",
            balance: String(received),
            locked: "0",
          });
        }
      }

      // Insert copy order record (isBot=1 keeps it out of user's main order history)
      const [ord] = await tx
        .insert(ordersTable)
        .values({
          uid: randomUUID(),
          userId: rel.followerId,
          pairId: fill.pairId,
          side: fill.side,
          type: "market",
          price: String(fill.price),
          qty: String(scaledQty),
          filledQty: String(scaledQty),
          avgPrice: String(fill.price),
          fee: String(fee),
          tds: "0",
          status: "filled",
          isBot: 1,
        })
        .returning({ id: ordersTable.id });

      // Insert copy trade record (no uid — DB provides default)
      await tx.insert(tradesTable).values({
        userId: rel.followerId,
        orderId: ord.id,
        pairId: fill.pairId,
        side: fill.side,
        price: String(fill.price),
        qty: String(scaledQty),
        fee: String(fee),
        tds: "0",
        isTaker: 1,
      });

      // Increment copy count on the relation
      await tx
        .update(copyRelationsTable)
        .set({
          totalCopiedTrades: sql`${copyRelationsTable.totalCopiedTrades} + 1`,
        })
        .where(eq(copyRelationsTable.id, rel.id));
    });

    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("insufficient_balance")) {
      logger.debug(
        { followerId: rel.followerId, msg },
        "copy-engine: skip — insufficient balance",
      );
      return false;
    }
    throw err;
  }
}
