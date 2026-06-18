import { Router, type IRouter } from "express";
import { db, inrTransactionsTable, walletsTable, coinsTable, kycRecordsTable, settingsTable, walletLedgerTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate } from "../lib/price-service";
import { z } from "zod/v4";

const router: IRouter = Router();

function serializeInr(t: any) {
  return {
    id: t.id, type: t.type,
    amountInr:  parseFloat(t.amountInr),
    usdAmount:  t.usdAmount ? parseFloat(t.usdAmount) : null,
    method:     t.method,
    upiId:      t.upiId ?? null,
    bankName:   t.bankName ?? null,
    accountNumber: t.accountNumber ?? null,
    ifscCode:   t.ifscCode ?? null,
    utrNumber:  t.utrNumber ?? null,
    referenceNumber: t.referenceNumber ?? null,
    status:     t.status,
    adminNote:  t.adminNote ?? null,
    createdAt:  t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  };
}

async function getInrWallet(userId: number) {
  const [coin] = await db.select({ id: coinsTable.id }).from(coinsTable)
    .where(eq(coinsTable.symbol, "INR")).limit(1);
  if (!coin) return null;

  // Auto-create the INR fiat wallet on first access (idempotent)
  await db.insert(walletsTable)
    .values({ userId, coinId: coin.id, walletType: "inr", balance: "0", locked: "0" })
    .onConflictDoNothing();

  const [w] = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "inr")))
    .limit(1);
  return { coinId: coin.id, wallet: w ?? null };
}

const DepositSchema = z.object({
  amountInr: z.number().min(100, "Minimum ₹100"),
  method:    z.enum(["upi", "bank_transfer", "neft", "rtgs", "imps"]),
  upiId:     z.string().optional(),
  utrNumber: z.string().optional(),
  bankName:  z.string().optional(),
});

const WithdrawSchema = z.object({
  amountInr:     z.number().min(500, "Minimum ₹500"),
  method:        z.enum(["upi", "bank_transfer", "neft", "rtgs", "imps"]),
  bankName:      z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode:      z.string().optional(),
  accountHolder: z.string().optional(),
  upiId:         z.string().optional(),
});

/* GET /api/payments/inr/bank-details — returns Zebvix deposit account details.
   Admin can configure via settings key "inr_deposit_bank" (JSON). */
router.get("/payments/inr/bank-details", async (_req, res): Promise<void> => {
  try {
    const [row] = await db.select().from(settingsTable)
      .where(eq(settingsTable.key, "inr_deposit_bank")).limit(1);
    if (row?.value) {
      res.json(JSON.parse(row.value as string));
      return;
    }
  } catch { /* fall through to defaults */ }
  res.json({
    upiId:         "zebvix@ybl",
    bankName:      "HDFC Bank",
    accountNumber: "50200093456789",
    ifscCode:      "HDFC0001234",
    accountHolder: "Zebvix Exchange Pvt Ltd",
    note:          "Add your User ID in payment remarks for faster credit",
  });
});

/* POST /api/payments/inr/deposit */
router.post("/payments/inr/deposit", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = DepositSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { amountInr, method, upiId, utrNumber, bankName } = parsed.data;

  const rate = getInrRate();
  const usdAmount = (amountInr / rate).toFixed(8);

  const [tx] = await db.insert(inrTransactionsTable).values({
    userId:    req.user!.id,
    type:      "deposit",
    amountInr: String(amountInr),
    usdAmount,
    method,
    upiId:     upiId ?? null,
    utrNumber: utrNumber ?? null,
    bankName:  bankName ?? null,
    status:    "pending",
  }).returning();
  res.status(201).json(serializeInr(tx));
});

/* POST /api/payments/inr/withdraw */
router.post("/payments/inr/withdraw", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = WithdrawSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { amountInr, method, bankName, accountNumber, ifscCode, accountHolder, upiId } = parsed.data;

  const userId = req.user!.id;

  const [kyc] = await db.select({ id: kycRecordsTable.id }).from(kycRecordsTable)
    .where(and(eq(kycRecordsTable.userId, userId), eq(kycRecordsTable.status, "approved"))).limit(1);
  if (!kyc) {
    res.status(403).json({ error: "KYC verification required for INR withdrawals." }); return;
  }

  // Pre-fetch coinId only (outside tx) — the actual wallet balance check
  // happens INSIDE the transaction with FOR UPDATE so concurrent requests
  // cannot double-spend the same balance.
  const inrData = await getInrWallet(userId);
  if (!inrData?.wallet) {
    res.status(400).json({ error: "INR wallet not found. Please deposit first." }); return;
  }

  const rate = getInrRate();
  const usdAmount = (amountInr / rate).toFixed(8);

  await db.transaction(async (tx) => {
    // Re-read with row-level lock so concurrent withdrawals cannot race.
    const [w] = await tx.select().from(walletsTable)
      .where(eq(walletsTable.id, inrData.wallet!.id))
      .for("update").limit(1);
    if (!w) { const e: any = new Error("INR wallet not found"); e.code = 400; throw e; }

    const avail = parseFloat(w.balance ?? "0");
    if (avail < amountInr) {
      const e: any = new Error(`Insufficient INR balance. Have ₹${avail.toFixed(2)}, need ₹${amountInr.toFixed(2)}`);
      e.code = 400;
      throw e;
    }

    await tx.update(walletsTable).set({
      balance: sql`${walletsTable.balance} - ${amountInr}`,
      locked:  sql`${walletsTable.locked}  + ${amountInr}`,
      updatedAt: new Date(),
    }).where(eq(walletsTable.id, w.id));

    const [inrTx] = await tx.insert(inrTransactionsTable).values({
      userId, type: "withdrawal",
      amountInr: String(amountInr), usdAmount,
      method, bankName: bankName ?? null, accountNumber: accountNumber ?? null,
      ifscCode: ifscCode ?? null, accountHolder: accountHolder ?? null,
      upiId: upiId ?? null, status: "pending",
    }).returning();

    await tx.insert(walletLedgerTable).values({
      userId, coinId: inrData.coinId!, walletType: "inr", type: "withdrawal_inr",
      amount: (-amountInr).toFixed(8),
      balanceBefore: w.balance,
      balanceAfter: (parseFloat(w.balance) - amountInr).toFixed(8),
      refType: "inr_withdrawal", refId: String(inrTx.id), note: "INR withdrawal initiated",
    });
  });

  res.status(201).json({ success: true, amountInr, method, status: "pending" });
});

/* GET /api/payments/inr/history */
router.get("/payments/inr/history", requireAuth, async (req: any, res): Promise<void> => {
  const txs = await db.select().from(inrTransactionsTable)
    .where(eq(inrTransactionsTable.userId, req.user!.id))
    .orderBy(desc(inrTransactionsTable.createdAt)).limit(100);
  res.json(txs.map(serializeInr));
});

/* GET /api/payments/inr/balance */
router.get("/payments/inr/balance", requireAuth, async (req: any, res): Promise<void> => {
  const inrData = await getInrWallet(req.user!.id);
  const bal = inrData?.wallet ? parseFloat(inrData.wallet.balance as string ?? "0") : 0;
  const locked = inrData?.wallet ? parseFloat(inrData.wallet.locked as string ?? "0") : 0;
  res.json({ balance: bal, locked, available: bal - locked });
});

export default router;
