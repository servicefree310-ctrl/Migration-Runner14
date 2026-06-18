// P2P escrow helpers — the single chokepoint for P2P balance moves.
// All P2P routes must call lockEscrow / releaseEscrow / refundEscrow
// rather than mutating wallets.{balance,p2pLocked} directly.
//
// Implementation pattern matches every other balance-mutating module
// in the codebase — there is no separate "transfer engine helper" to
// delegate to; the convention IS this exact shape:
//   - routes/transfer.ts          (spot↔futures↔earn↔inr transfers)
//   - lib/matching-engine.ts      (spot order fills, maker/taker settle)
//   - lib/inmem-engine/prod/settler.ts  (settlement refunds)
// All four open a `db.transaction`, take a `SELECT … FOR UPDATE` row
// lock on the wallet, and apply numeric deltas via parameterised
// drizzle `sql` templates (e.g. `sql\`${walletsTable.balance} - ${amt}\``).
// p2p-escrow.ts IS the centralized helper for the P2P domain, mirroring
// that pattern so accounting invariants are preserved end-to-end.
// Amounts are strings to align with numeric(28,8) and avoid float drift.

import { and, eq, sql } from "drizzle-orm";
import { db, walletsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

class EscrowError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
    this.name = "EscrowError";
  }
}

export function quantizeQty(qty: string | number): string {
  const n = typeof qty === "string" ? Number(qty) : qty;
  if (!Number.isFinite(n) || n <= 0) {
    throw new EscrowError(400, "Invalid escrow quantity");
  }
  const q = n.toFixed(8);
  // Guard against sub-satoshi inputs (e.g. 1e-9) that round to 0.00000000.
  if (Number(q) <= 0) {
    throw new EscrowError(400, "Order quantity is below the minimum (0.00000001)");
  }
  return q;
}

export async function ensureSpotWalletForUpdate(tx: Tx, userId: number, coinId: number) {
  const [w] = await tx.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, "spot")))
    .for("update").limit(1);
  if (w) return w;
  const [created] = await tx.insert(walletsTable).values({
    userId, coinId, walletType: "spot", balance: "0", locked: "0", p2pLocked: "0",
  }).returning();
  const [locked] = await tx.select().from(walletsTable).where(eq(walletsTable.id, created.id)).for("update").limit(1);
  return locked;
}

export async function lockEscrow(tx: Tx, sellerId: number, coinId: number, qty: string | number): Promise<void> {
  const q = quantizeQty(qty);
  const wallet = await ensureSpotWalletForUpdate(tx, sellerId, coinId);
  if (Number(wallet.balance) < Number(q)) {
    throw new EscrowError(400, "Seller has insufficient balance — try a smaller order");
  }
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} - ${q}::numeric`,
    p2pLocked: sql`${walletsTable.p2pLocked} + ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, wallet.id));
}

export async function releaseEscrow(
  tx: Tx,
  sellerId: number,
  buyerId: number,
  coinId: number,
  qty: string | number,
): Promise<void> {
  const q = quantizeQty(qty);
  const sellerWallet = await ensureSpotWalletForUpdate(tx, sellerId, coinId);
  const buyerWallet = await ensureSpotWalletForUpdate(tx, buyerId, coinId);
  if (Number(sellerWallet.p2pLocked) + 1e-8 < Number(q)) {
    throw new EscrowError(500, "Escrow accounting error — p2p_locked < qty");
  }
  await tx.update(walletsTable).set({
    p2pLocked: sql`${walletsTable.p2pLocked} - ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, sellerWallet.id));
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} + ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, buyerWallet.id));
}

export async function refundEscrow(tx: Tx, sellerId: number, coinId: number, qty: string | number): Promise<void> {
  const q = quantizeQty(qty);
  const wallet = await ensureSpotWalletForUpdate(tx, sellerId, coinId);
  if (Number(wallet.p2pLocked) + 1e-8 < Number(q)) {
    throw new EscrowError(500, "Escrow accounting error — p2p_locked < refund qty");
  }
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} + ${q}::numeric`,
    p2pLocked: sql`${walletsTable.p2pLocked} - ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, wallet.id));
}

// ─── Ad-level fund operations ────────────────────────────────────────────────
// Called at sell ad creation/deletion, NOT at order open/cancel (those are
// already covered by the upfront lock). Buy ads do not use these at all.

/** Lock totalQty when a SELL ad goes live. balance → p2pLocked. */
export async function lockAdFunds(tx: Tx, sellerId: number, coinId: number, qty: string | number): Promise<void> {
  const q = quantizeQty(qty);
  const wallet = await ensureSpotWalletForUpdate(tx, sellerId, coinId);
  if (Number(wallet.balance) < Number(q)) {
    throw new EscrowError(400, "Insufficient balance to post sell ad");
  }
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} - ${q}::numeric`,
    p2pLocked: sql`${walletsTable.p2pLocked} + ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, wallet.id));
}

/** Unlock remainingQty when a SELL ad is closed/deleted. p2pLocked → balance. */
export async function unlockAdFunds(tx: Tx, sellerId: number, coinId: number, qty: string | number): Promise<void> {
  const q = quantizeQty(qty);
  const wallet = await ensureSpotWalletForUpdate(tx, sellerId, coinId);
  if (Number(wallet.p2pLocked) + 1e-8 < Number(q)) {
    throw new EscrowError(500, "Ad unlock accounting error — p2p_locked < availableQty");
  }
  await tx.update(walletsTable).set({
    balance: sql`${walletsTable.balance} + ${q}::numeric`,
    p2pLocked: sql`${walletsTable.p2pLocked} - ${q}::numeric`,
    updatedAt: new Date(),
  }).where(eq(walletsTable.id, wallet.id));
}
