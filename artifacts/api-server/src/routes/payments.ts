import { Router, type IRouter } from "express";
import { db, gatewaysTable, inrDepositsTable, walletsTable, coinsTable, walletLedgerTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { createOrder, fetchPayment, verifyCheckoutSignature } from "../lib/razorpay";

const router: IRouter = Router();

// ─── Create Razorpay order for an INR deposit ──────────────────────────────
router.post("/inr-deposits/razorpay/order", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { gatewayId, amount } = req.body ?? {};
  const amt = Number(amount);
  if (!gatewayId || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "gatewayId and positive amount required" }); return;
  }

  const [g] = await db.select().from(gatewaysTable).where(eq(gatewaysTable.id, Number(gatewayId))).limit(1);
  if (!g) { res.status(404).json({ error: "Gateway not found" }); return; }
  if (g.provider !== "razorpay") { res.status(400).json({ error: "Gateway is not Razorpay" }); return; }
  if (g.status !== "active" || g.direction !== "deposit") { res.status(400).json({ error: "Gateway not available" }); return; }
  if (!g.apiKey || !g.apiSecret) { res.status(500).json({ error: "Razorpay credentials not configured" }); return; }

  const min = Number(g.minAmount), max = Number(g.maxAmount);
  if (min > 0 && amt < min) { res.status(400).json({ error: `Minimum is ₹${min}` }); return; }
  if (max > 0 && amt > max) { res.status(400).json({ error: `Maximum is ₹${max}` }); return; }

  const fee = +(Number(g.feeFlat) + (amt * Number(g.feePercent) / 100)).toFixed(2);
  const refId = `RZP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  let order;
  try {
    order = await createOrder({ keyId: g.apiKey, keySecret: g.apiSecret }, {
      amount: amt, currency: g.currency || "INR", receipt: refId,
      notes: { userId: String(userId), gatewayId: String(g.id) },
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message }); return;
  }

  const [row] = await db.insert(inrDepositsTable).values({
    userId, gatewayId: Number(gatewayId), amount: String(amt), fee: String(fee),
    refId, status: "pending", gatewayOrderId: order.id,
  }).returning();

  res.status(201).json({
    deposit: row,
    order: { id: order.id, amount: order.amount, currency: order.currency },
    keyId: g.apiKey,
    name: g.name,
  });
});

// ─── Verify Razorpay checkout signature & credit wallet ────────────────────
router.post("/inr-deposits/razorpay/verify", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ error: "Missing payment fields" }); return;
  }

  const [dep] = await db.select().from(inrDepositsTable).where(and(
    eq(inrDepositsTable.gatewayOrderId, String(razorpay_order_id)),
    eq(inrDepositsTable.userId, userId),
  )).limit(1);
  if (!dep) { res.status(404).json({ error: "Deposit not found" }); return; }

  const [g] = await db.select().from(gatewaysTable).where(eq(gatewaysTable.id, dep.gatewayId)).limit(1);
  if (!g || !g.apiKey || !g.apiSecret) { res.status(500).json({ error: "Gateway misconfigured" }); return; }

  const ok = verifyCheckoutSignature({ keyId: g.apiKey, keySecret: g.apiSecret },
    String(razorpay_order_id), String(razorpay_payment_id), String(razorpay_signature));
  if (!ok) { res.status(400).json({ error: "Invalid signature" }); return; }

  // Cross-check with Razorpay API to ensure payment captured
  let payment;
  try {
    payment = await fetchPayment({ keyId: g.apiKey, keySecret: g.apiSecret }, String(razorpay_payment_id));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message }); return;
  }
  if (payment.order_id !== String(razorpay_order_id)) { res.status(400).json({ error: "Order/payment mismatch" }); return; }
  if (!["captured", "authorized"].includes(payment.status)) {
    res.status(400).json({ error: `Payment status: ${payment.status}` }); return;
  }
  if (Math.round(Number(dep.amount) * 100) !== payment.amount) {
    res.status(400).json({ error: "Amount mismatch" }); return;
  }

  await creditDepositOnce(dep.id, String(razorpay_payment_id), payment.method);
  const [updated] = await db.select().from(inrDepositsTable).where(eq(inrDepositsTable.id, dep.id)).limit(1);
  res.json({ ok: true, deposit: updated });
});

// Idempotent credit — completes a pending deposit exactly once
export async function creditDepositOnce(depositId: number, paymentId: string, method?: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(inrDepositsTable).where(eq(inrDepositsTable.id, depositId)).for("update").limit(1);
    if (!d) return false;
    if (d.status === "completed") return false;
    const [inrCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
    if (!inrCoin) throw new Error("INR coin not configured");
    const [w] = await tx.select().from(walletsTable).where(and(
      eq(walletsTable.userId, d.userId),
      eq(walletsTable.coinId, inrCoin.id),
      eq(walletsTable.walletType, "inr"),
    )).for("update").limit(1);
    if (!w) throw new Error("INR wallet not found");
    const credit = Number(d.amount) - Number(d.fee || 0);
    const pmtBalBefore = w.balance;
    await tx.update(walletsTable).set({
      balance: sql`${walletsTable.balance} + ${credit}`,
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, w.id));
    await tx.insert(walletLedgerTable).values({
      userId: d.userId, coinId: inrCoin.id, walletType: "inr", type: "deposit_inr",
      amount: credit.toFixed(8),
      balanceBefore: pmtBalBefore,
      balanceAfter: (Number(pmtBalBefore) + credit).toFixed(8),
      refType: "inr_deposit", refId: String(depositId), note: "INR deposit via payment gateway",
    });
    await tx.update(inrDepositsTable).set({
      status: "completed",
      gatewayPaymentId: paymentId,
      gatewayMethod: method ?? null,
      processedAt: new Date(),
    }).where(eq(inrDepositsTable.id, depositId));
    logger.info({ depositId, paymentId, credit }, "Razorpay deposit credited");
    return true;
  });
}

export default router;
