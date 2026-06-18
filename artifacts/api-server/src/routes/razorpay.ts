/**
 * Razorpay INR Gateway
 * POST /api/payments/razorpay/create-order — create a Razorpay order
 * POST /api/payments/razorpay/verify       — verify payment + credit wallet
 * POST /api/payments/razorpay/webhook      — Razorpay webhook handler
 */
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import { db, inrTransactionsTable, walletsTable, coinsTable, exchangeSettingsTable, walletLedgerTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";

const router: IRouter = Router();

async function getRazorpayKeys() {
  const rows = await db.select().from(exchangeSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    keyId:         map["razorpay_key_id"]         ?? "",
    keySecret:     map["razorpay_key_secret"]      ?? "",
    webhookSecret: map["razorpay_webhook_secret"]  ?? "",
  };
}

async function creditInrWallet(userId: number, amountInr: number) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
    .where(eq(coinsTable.symbol, "INR")).limit(1);
  if (!coin) return;
  const [w] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "inr"))).limit(1);
  const balBefore = w?.balance ?? "0";
  if (w) {
    await db.update(walletsTable).set({ balance: sql`${walletsTable.balance} + ${amountInr}`, updatedAt: new Date() })
      .where(eq(walletsTable.id, w.id));
  } else {
    await db.insert(walletsTable).values({ userId, coinId: coin.id, walletType: "inr", balance: String(amountInr), locked: "0" });
  }
  await db.insert(walletLedgerTable).values({
    userId, coinId: coin.id, walletType: "inr", type: "deposit_inr",
    amount: amountInr.toFixed(8),
    balanceBefore: balBefore,
    balanceAfter: (Number(balBefore) + amountInr).toFixed(8),
    refType: "razorpay", note: "INR deposit via Razorpay",
  });
}

/* POST /api/payments/razorpay/create-order */
router.post("/payments/razorpay/create-order", requireAuth, async (req: any, res: Response): Promise<void> => {
  const { amountInr } = req.body as { amountInr: number };
  if (!amountInr || amountInr < 100) { res.status(400).json({ error: "Minimum deposit ₹100" }); return; }

  const { keyId, keySecret } = await getRazorpayKeys();
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "Razorpay not configured. Please set API keys in admin → Exchange Settings." }); return;
  }

  const amountPaise = Math.round(amountInr * 100);
  const rate        = getInrRate();
  const usdAmount   = (amountInr / rate).toFixed(8);

  const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: `zbx_${Date.now()}`, notes: { user_id: String(req.user!.id) } }),
  });

  if (!rpRes.ok) {
    const err: any = await rpRes.json().catch(() => ({}));
    res.status(502).json({ error: err?.error?.description ?? "Failed to create Razorpay order" }); return;
  }

  const order: any = await rpRes.json();

  const [tx] = await db.insert(inrTransactionsTable).values({
    userId:          req.user!.id,
    type:            "deposit",
    amountInr:       String(amountInr),
    usdAmount,
    method:          "upi",
    referenceNumber: order.id,
    status:          "pending",
  }).returning();

  res.json({ orderId: order.id, keyId, amountPaise, currency: "INR", txId: tx.id });
});

/* POST /api/payments/razorpay/verify */
router.post("/payments/razorpay/verify", requireAuth, async (req: any, res: Response): Promise<void> => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, txId } = req.body as {
    razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; txId: number;
  };

  const { keySecret } = await getRazorpayKeys();
  if (!keySecret) { res.status(503).json({ error: "Gateway not configured" }); return; }

  const expected = crypto.createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature ?? ""))) {
    res.status(400).json({ error: "Invalid payment signature" }); return;
  }

  const [tx] = await db.select().from(inrTransactionsTable)
    .where(and(eq(inrTransactionsTable.id, txId), eq(inrTransactionsTable.userId, req.user!.id))).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.status === "completed") { res.json({ success: true, message: "Already credited" }); return; }

  const amountInr = parseFloat(tx.amountInr);
  await db.transaction(async (t) => {
    await creditInrWallet(req.user!.id, amountInr);
    await t.update(inrTransactionsTable).set({
      status:    "completed",
      utrNumber: razorpay_payment_id,
      updatedAt: new Date(),
    }).where(eq(inrTransactionsTable.id, txId));
  });

  res.json({ success: true, amountInr, credited: true });
});

/* POST /api/payments/razorpay/webhook */
router.post("/payments/razorpay/webhook", async (req: Request, res: Response): Promise<void> => {
  const { webhookSecret } = await getRazorpayKeys();
  if (!webhookSecret) { res.status(200).end(); return; }

  const sig  = req.headers["x-razorpay-signature"] as string ?? "";
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    res.status(400).json({ error: "Invalid signature" }); return;
  }

  const event: any = req.body;
  if (event.event === "payment.captured") {
    const payment  = event.payload?.payment?.entity;
    const userId   = parseInt(payment?.notes?.user_id ?? "0", 10);
    const orderId  = payment?.order_id;
    const amountPaise = payment?.amount ?? 0;
    const amountInr   = amountPaise / 100;

    if (userId && orderId) {
      const [tx] = await db.select().from(inrTransactionsTable)
        .where(and(eq(inrTransactionsTable.userId, userId), eq(inrTransactionsTable.referenceNumber, orderId))).limit(1);
      if (tx && tx.status !== "completed") {
        await db.transaction(async (t) => {
          await creditInrWallet(userId, amountInr);
          await t.update(inrTransactionsTable).set({ status: "completed", utrNumber: payment.id, updatedAt: new Date() })
            .where(eq(inrTransactionsTable.id, tx.id));
        });
      }
    }
  }
  res.status(200).json({ ok: true });
});

export default router;
