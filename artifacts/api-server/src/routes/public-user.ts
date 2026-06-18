import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  walletsTable,
  coinsTable,
  bankAccountsTable,
  inrWithdrawalsTable,
  cryptoWithdrawalsTable,
  inrDepositsTable,
  cryptoDepositsTable,
  networksTable,
  kycRecordsTable,
  kycSettingsTable,
  usersTable,
  gatewaysTable,
  depositAddressesTable,
  referralsTable,
} from "@workspace/db";
import { loadReferralConfig } from "./admin-referrals";
import { requireAuth } from "../middlewares/auth";
import { consumeVerifiedOtp } from "./otp";
import { getBankPolicy } from "./admin";
import { loadVipTiers } from "./fees";
import { autoVerifyUserDeposit } from "../lib/deposit-sweeper";

const router: IRouter = Router();

// ─── Wallets ──────────────────────────────────────────────────────────────────
router.get("/wallets", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select({
      id: walletsTable.id,
      walletType: walletsTable.walletType,
      coinId: walletsTable.coinId,
      balance: walletsTable.balance,
      locked: walletsTable.locked,
      coinSymbol: coinsTable.symbol,
      coinName: coinsTable.name,
      coinPrice: coinsTable.currentPrice,
    })
    .from(walletsTable)
    .innerJoin(coinsTable, eq(walletsTable.coinId, coinsTable.id))
    .where(eq(walletsTable.userId, userId));

  // Server-side live valuation so the Portfolio page doesn't depend on the
  // browser having every WS ticker subscribed (which it usually doesn't).
  const { getCache, getInrRate } = await import("../lib/price-service");
  const ticks: any[] = getCache();
  const inrRate = getInrRate() || 84;
  const priceFor = (sym: string): number => {
    const s = (sym || "").toUpperCase();
    if (s === "USDT" || s === "USDC" || s === "USD" || s === "BUSD" || s === "DAI") return 1;
    if (s === "INR") return inrRate > 0 ? 1 / inrRate : 0;
    const t = ticks.find((tk: any) => String(tk.symbol).toUpperCase() === s);
    return t?.usdt ? Number(t.usdt) : 0;
  };

  // IMPORTANT: keep the response shape as a flat array — existing consumers
  // like Earn.tsx do `walletQ.data.find(...)` and would break on an object.
  // We just enrich each row with the new live valuation fields.
  const enriched = rows.map((w) => {
    const bal = Number(w.balance) + Number(w.locked);
    const usdPrice = priceFor(w.coinSymbol);
    const usdValue = bal * usdPrice;
    return {
      ...w,
      // Keep `balance` and `locked` as the original strings so Earn.tsx's
      // `Number(spot?.balance)` math is unchanged. New numeric helpers below.
      balanceNum: Number(w.balance),
      lockedNum: Number(w.locked),
      // Convenience aliases (Wallet.tsx-style).
      currency: w.coinSymbol,
      inOrder: Number(w.locked),
      type: w.walletType.toUpperCase(),
      usdPrice,
      usdValue: Math.round(usdValue * 1e6) / 1e6,
      inrValue: Math.round(usdValue * inrRate * 100) / 100,
    };
  });

  res.json(enriched);
});

// ─── Banks (with single-verified-bank rule) ───────────────────────────────────
router.get("/banks", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(bankAccountsTable)
    .where(and(
      eq(bankAccountsTable.userId, req.user!.id),
      sql`${bankAccountsTable.status} <> 'deleted'`,
    ))
    .orderBy(desc(bankAccountsTable.createdAt));
  res.json(rows);
});

router.post("/banks", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { bankName, accountNumber, ifsc, holderName } = req.body ?? {};
  if (!bankName || !accountNumber || !ifsc || !holderName) {
    res.status(400).json({ error: "bankName, accountNumber, ifsc, holderName required" }); return;
  }
  const ifscNorm = String(ifsc).toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscNorm)) {
    res.status(400).json({ error: "Invalid IFSC code" }); return;
  }
  const acctNorm = String(accountNumber).replace(/\s+/g, "");
  const policy = await getBankPolicy();

  try {
    const created = await db.transaction(async (tx) => {
      // Per-user advisory lock to serialize concurrent bank mutations
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BigInt(0xB4E_0000)}, ${userId})`);
      // 1. Cap on active (non-deleted) banks per user
      const active = await tx
        .select({ id: bankAccountsTable.id, status: bankAccountsTable.status })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, userId));
      const activeCount = active.filter((b) => b.status !== "deleted").length;
      if (activeCount >= policy.maxPerUser) {
        const e: any = new Error(`You can have at most ${policy.maxPerUser} bank account${policy.maxPerUser === 1 ? "" : "s"}. Remove one first.`);
        e.code = 409; throw e;
      }
      // 2. Block if there's already a verified bank when limit is 1 (back-compat)
      if (policy.maxPerUser === 1) {
        const verified = active.filter((b) => b.status === "verified");
        if (verified.length > 0) {
          const e: any = new Error("You already have a verified bank account. Remove it first to add another.");
          e.code = 409; throw e;
        }
      }
      // 3. Block duplicate account number for same user (active rows)
      const dup = await tx
        .select({ id: bankAccountsTable.id })
        .from(bankAccountsTable)
        .where(and(
          eq(bankAccountsTable.userId, userId),
          eq(bankAccountsTable.accountNumber, acctNorm),
          sql`${bankAccountsTable.status} <> 'deleted'`,
        ))
        .limit(1);
      if (dup.length > 0) {
        const e: any = new Error("This account is already added"); e.code = 409; throw e;
      }
      const [row] = await tx.insert(bankAccountsTable).values({
        userId, bankName: String(bankName), accountNumber: acctNorm, ifsc: ifscNorm,
        holderName: String(holderName), status: "under_review", isPrimary: activeCount === 0,
      }).returning();
      return row;
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code === 409) { res.status(409).json({ error: e.message }); return; }
    if (typeof e?.message === "string" && e.message.includes("bank_accounts_one_verified_per_user")) {
      res.status(409).json({ error: "You already have a verified bank account." }); return;
    }
    throw e;
  }
});

router.patch("/banks/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const { bankName, accountNumber, ifsc, holderName } = req.body ?? {};
  const policy = await getBankPolicy();
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BigInt(0xB4E_0000)}, ${userId})`);
      const [bank] = await tx.select().from(bankAccountsTable)
        .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.userId, userId))).limit(1);
      if (!bank) { const e: any = new Error("Bank not found"); e.code = 404; throw e; }
      if (bank.status === "deleted") { const e: any = new Error("This account has been removed"); e.code = 400; throw e; }
      if (bank.status === "verified") { const e: any = new Error("Verified bank cannot be edited. Remove it and add a new one."); e.code = 403; throw e; }
      // Lifetime edit cap (sum across user's banks)
      const allBanks = await tx.select({ ec: bankAccountsTable.editCount }).from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, userId));
      const totalEdits = allBanks.reduce((s, b) => s + (b.ec ?? 0), 0);
      if (totalEdits >= policy.maxEdits) {
        const e: any = new Error(`Edit limit reached (${policy.maxEdits}). Contact support.`); e.code = 429; throw e;
      }
      const patch: Record<string, unknown> = {};
      if (typeof bankName === "string" && bankName.trim()) patch.bankName = bankName.trim();
      if (typeof holderName === "string" && holderName.trim()) patch.holderName = holderName.trim();
      if (typeof ifsc === "string") {
        const ifscNorm = ifsc.toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscNorm)) {
          const e: any = new Error("Invalid IFSC code"); e.code = 400; throw e;
        }
        patch.ifsc = ifscNorm;
      }
      let acctNorm: string | null = null;
      if (typeof accountNumber === "string") {
        acctNorm = accountNumber.replace(/\s+/g, "");
        if (!acctNorm) { const e: any = new Error("Invalid account number"); e.code = 400; throw e; }
        // Block duplicate against other active rows for same user
        const dup = await tx.select({ id: bankAccountsTable.id }).from(bankAccountsTable)
          .where(and(
            eq(bankAccountsTable.userId, userId),
            eq(bankAccountsTable.accountNumber, acctNorm),
            sql`${bankAccountsTable.status} <> 'deleted'`,
            sql`${bankAccountsTable.id} <> ${id}`,
          )).limit(1);
        if (dup.length > 0) { const e: any = new Error("Another bank already uses this account number"); e.code = 409; throw e; }
        patch.accountNumber = acctNorm;
      }
      if (Object.keys(patch).length === 0) {
        const e: any = new Error("No editable fields provided"); e.code = 400; throw e;
      }
      patch.editCount = (bank.editCount ?? 0) + 1;
      patch.status = "under_review";
      patch.rejectReason = null;
      patch.nameMatch = null;
      patch.nameMatchScore = null;
      const [row] = await tx.update(bankAccountsTable).set(patch)
        .where(eq(bankAccountsTable.id, id)).returning();
      return row;
    });
    res.json(updated);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.delete("/banks/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const policy = await getBankPolicy();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BigInt(0xB4E_0000)}, ${userId})`);
      const [bank] = await tx.select().from(bankAccountsTable)
        .where(and(eq(bankAccountsTable.id, id), eq(bankAccountsTable.userId, userId))).limit(1);
      if (!bank) { const e: any = new Error("Bank not found"); e.code = 404; throw e; }
      if (bank.status === "deleted") { const e: any = new Error("Already removed"); e.code = 400; throw e; }
      // Lifetime delete cap
      const removed = await tx.select({ id: bankAccountsTable.id }).from(bankAccountsTable)
        .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.status, "deleted")));
      if (removed.length >= policy.maxDeletes) {
        const e: any = new Error(`Delete limit reached (${policy.maxDeletes}). Contact support.`); e.code = 429; throw e;
      }
      await tx.update(bankAccountsTable).set({ status: "deleted", isPrimary: false })
        .where(eq(bankAccountsTable.id, id));
      return { ok: true, deleteCount: removed.length + 1, maxDeletes: policy.maxDeletes };
    });
    res.json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── Withdrawals (transactional balance lock + debit) ─────────────────────────
router.get("/inr-withdrawals", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(inrWithdrawalsTable)
    .where(eq(inrWithdrawalsTable.userId, req.user!.id))
    .orderBy(desc(inrWithdrawalsTable.createdAt));
  res.json(rows);
});

router.post("/inr-withdrawals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 (PAN) required to withdraw INR." });
    return;
  }
  const { bankId, amount, otpId } = req.body ?? {};
  const amt = Number(amount);
  if (!bankId || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "bankId and positive amount required" }); return;
  }
  if (amt < 100) { res.status(400).json({ error: "Minimum withdrawal is ₹100" }); return; }
  if (!otpId) { res.status(400).json({ error: "OTP verification required (otpId missing)" }); return; }

  // Apply VIP withdrawal fee discount (0% Regular → 25% VIP 5)
  const inrVipTiers = await loadVipTiers();
  const inrUserTier = inrVipTiers.find(t => t.level === (req.user!.vipTier ?? 0)) ?? inrVipTiers[0];
  const inrDiscountPct = inrUserTier?.withdrawDiscount ?? 0;
  const baseFeeInr = Math.max(10, +(amt * 0.001).toFixed(2));
  const fee = +(baseFeeInr * (1 - inrDiscountPct / 100)).toFixed(2);

  try {
    const created = await db.transaction(async (tx) => {
      // Atomic OTP consume (single-use, verified, fresh)
      const otpRes = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "withdraw", userId, tx });
      if (!otpRes.ok) { const e: any = new Error(otpRes.error); e.code = 400; throw e; }
      // Lock bank
      const [bank] = await tx.select().from(bankAccountsTable)
        .where(and(eq(bankAccountsTable.id, Number(bankId)), eq(bankAccountsTable.userId, userId)))
        .limit(1);
      if (!bank) { const e: any = new Error("Bank not found"); e.code = 404; throw e; }
      if (bank.status !== "verified") { const e: any = new Error("Bank must be verified to withdraw"); e.code = 403; throw e; }

      // Lock & debit INR wallet (any wallet of type INR for this user)
      const [inrCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
      if (!inrCoin) { const e: any = new Error("INR coin not configured"); e.code = 500; throw e; }
      const [wallet] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, inrCoin.id), eq(walletsTable.walletType, "inr")))
        .for("update")
        .limit(1);
      if (!wallet) { const e: any = new Error("INR wallet not found"); e.code = 404; throw e; }
      const balance = Number(wallet.balance);
      if (balance < amt) { const e: any = new Error(`Insufficient balance (₹${balance.toFixed(2)})`); e.code = 400; throw e; }

      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${amt}`,
          locked: sql`${walletsTable.locked} + ${amt}`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.id, wallet.id));

      const refId = `WINR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const [wd] = await tx.insert(inrWithdrawalsTable).values({
        userId, bankId: Number(bankId),
        amount: String(amt), fee: String(fee), refId, status: "pending",
      }).returning();
      return wd;
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/crypto-withdrawals", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(cryptoWithdrawalsTable)
    .where(eq(cryptoWithdrawalsTable.userId, req.user!.id))
    .orderBy(desc(cryptoWithdrawalsTable.createdAt));
  res.json(rows);
});

router.post("/crypto-withdrawals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 2) {
    res.status(403).json({ error: "KYC Level 2 required to withdraw crypto. Please complete Aadhaar + selfie verification." });
    return;
  }
  const { coinId, networkId, amount, toAddress, memo, otpId } = req.body ?? {};
  const amt = Number(amount);
  if (!coinId || !networkId || !Number.isFinite(amt) || amt <= 0 || !toAddress) {
    res.status(400).json({ error: "coinId, networkId, positive amount, toAddress required" }); return;
  }
  if (String(toAddress).trim().length < 20) {
    res.status(400).json({ error: "Recipient address looks invalid" }); return;
  }
  if (!otpId) { res.status(400).json({ error: "OTP verification required (otpId missing)" }); return; }

  // Pre-load VIP discount outside transaction to avoid async calls inside tx
  const cryptoVipTiers = await loadVipTiers();
  const cryptoUserTier = cryptoVipTiers.find(t => t.level === (req.user!.vipTier ?? 0)) ?? cryptoVipTiers[0];
  const cryptoDiscountPct = cryptoUserTier?.withdrawDiscount ?? 0;

  try {
    const created = await db.transaction(async (tx) => {
      const otpRes = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "withdraw", userId, tx });
      if (!otpRes.ok) { const e: any = new Error(otpRes.error); e.code = 400; throw e; }
      const [network] = await tx.select().from(networksTable).where(eq(networksTable.id, Number(networkId))).limit(1);
      if (!network) { const e: any = new Error("Network not found"); e.code = 404; throw e; }
      if (network.coinId !== Number(coinId)) { const e: any = new Error("Network does not belong to this coin"); e.code = 400; throw e; }
      if (network.status !== "active") { const e: any = new Error("Network is not active"); e.code = 400; throw e; }
      const minWd = Number(network.minWithdraw);
      if (amt < minWd) { const e: any = new Error(`Minimum withdrawal is ${minWd}`); e.code = 400; throw e; }
      if (network.memoRequired && (!memo || String(memo).trim().length === 0)) {
        const e: any = new Error("This network requires a memo/destination tag"); e.code = 400; throw e;
      }

      // Withdraw fee = max( fixed + (amt × percent%), feeMin ), then apply VIP discount
      const feeFixed = Number(network.withdrawFee) || 0;
      const feePct = Number(network.withdrawFeePercent) || 0;
      const feeMin = Number(network.withdrawFeeMin) || 0;
      const calcFee = feeFixed + (amt * feePct / 100);
      const baseFee = +Math.max(calcFee, feeMin).toFixed(8);
      const fee = +(baseFee * (1 - cryptoDiscountPct / 100)).toFixed(8);
      const tds = +(amt * 0.01).toFixed(8); // 1% TDS on crypto withdraw

      const [wallet] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, Number(coinId)), eq(walletsTable.walletType, "spot")))
        .for("update")
        .limit(1);
      if (!wallet) { const e: any = new Error("Spot wallet for this coin not found"); e.code = 404; throw e; }

      const totalDebit = amt; // user requested gross; fee + tds taken from this on processing
      const balance = Number(wallet.balance);
      if (balance < totalDebit) { const e: any = new Error(`Insufficient balance (${balance})`); e.code = 400; throw e; }

      await tx.update(walletsTable)
        .set({
          balance: sql`${walletsTable.balance} - ${totalDebit}`,
          locked: sql`${walletsTable.locked} + ${totalDebit}`,
          updatedAt: new Date(),
        })
        .where(eq(walletsTable.id, wallet.id));

      const refId = `WCRY-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const [wd] = await tx.insert(cryptoWithdrawalsTable).values({
        userId, coinId: Number(coinId), networkId: Number(networkId),
        amount: String(amt), fee: String(fee + tds),
        toAddress: String(toAddress).trim(), memo: memo ? String(memo) : null,
        status: "pending",
      }).returning();
      return wd;
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── KYC ──────────────────────────────────────────────────────────────────────
router.get("/kyc/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(kycSettingsTable).orderBy(kycSettingsTable.level);
  res.json(rows);
});

router.get("/kyc/my", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(kycRecordsTable)
    .where(eq(kycRecordsTable.userId, req.user!.id))
    .orderBy(desc(kycRecordsTable.createdAt));
  res.json(rows);
});

// Map a configured field key to its column on the kyc_records row.
// Anything not in this set is treated as a custom field and stored in `extra`.
const KYC_FIELD_TO_COLUMN: Record<string, "fullName" | "dob" | "address" | "panNumber" | "aadhaarNumber" | "panDocUrl" | "aadhaarDocUrl" | "aadhaarDocBackUrl" | "selfieUrl"> = {
  fullName: "fullName",
  dob: "dob",
  address: "address",
  panNumber: "panNumber",
  aadhaarNumber: "aadhaarNumber",
  panDoc: "panDocUrl",
  panDocUrl: "panDocUrl",
  aadhaarDoc: "aadhaarDocUrl",
  aadhaarDocUrl: "aadhaarDocUrl",
  aadhaarDocBack: "aadhaarDocBackUrl",
  aadhaarDocBackUrl: "aadhaarDocBackUrl",
  selfie: "selfieUrl",
  selfieUrl: "selfieUrl",
};

type ParsedKycField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  regex?: string;
};

function parseFieldsConfig(raw: string): ParsedKycField[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.key === "string")
      .map((f) => ({
        key: String(f.key),
        label: String(f.label ?? f.key),
        type: String(f.type ?? "text"),
        required: Boolean(f.required),
        regex: typeof f.regex === "string" && f.regex.length > 0 ? f.regex : undefined,
      }));
  } catch {
    return [];
  }
}

router.post("/kyc/submit", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const lvl = Number(body.level);
  if (![1, 2, 3].includes(lvl)) { res.status(400).json({ error: "level must be 1, 2 or 3" }); return; }

  // Load the admin-configured template for this level
  const [setting] = await db.select().from(kycSettingsTable).where(eq(kycSettingsTable.level, lvl)).limit(1);
  if (!setting) { res.status(400).json({ error: `KYC level ${lvl} is not configured` }); return; }
  if (setting.enabled === false) { res.status(400).json({ error: `KYC level ${lvl} is currently disabled` }); return; }
  const fields = parseFieldsConfig(setting.fields);
  if (fields.length === 0) {
    res.status(500).json({ error: `KYC level ${lvl} has no fields configured. Ask an admin to configure the template.` });
    return;
  }

  // Build a normalized lookup of submitted values, accepting both raw keys and *Url aliases
  const valueOf = (key: string): string | undefined => {
    const direct = body[key];
    if (direct != null && String(direct).trim() !== "") return String(direct).trim();
    // Aliases
    if (key === "panDoc" && body.panDocUrl) return String(body.panDocUrl).trim();
    if (key === "aadhaarDoc" && body.aadhaarDocUrl) return String(body.aadhaarDocUrl).trim();
    if (key === "aadhaarDocBack" && body.aadhaarDocBackUrl) return String(body.aadhaarDocBackUrl).trim();
    if (key === "selfie" && body.selfieUrl) return String(body.selfieUrl).trim();
    return undefined;
  };

  // Validate each configured field
  const recordValues: Record<string, string | null> = {
    fullName: null, dob: null, address: null,
    panNumber: null, aadhaarNumber: null,
    panDocUrl: null, aadhaarDocUrl: null, aadhaarDocBackUrl: null, selfieUrl: null,
  };
  const extraValues: Record<string, string> = {};

  for (const f of fields) {
    let v = valueOf(f.key);
    if (v && (f.key === "panNumber" || f.type === "identity")) v = v.toUpperCase().replace(/\s+/g, "");
    if (v && f.key === "aadhaarNumber") v = v.replace(/\s+/g, "");

    if (f.required && !v) {
      res.status(400).json({ error: `${f.label} is required` });
      return;
    }
    if (v && f.regex) {
      let ok = false;
      try { ok = new RegExp(f.regex).test(v); } catch { ok = true; }
      if (!ok) { res.status(400).json({ error: `${f.label} format is invalid` }); return; }
    }

    if (v != null) {
      const col = KYC_FIELD_TO_COLUMN[f.key];
      if (col) {
        recordValues[col] = v;
      } else {
        extraValues[f.key] = v;
      }
    }
  }

  // Block duplicate pending submission for same level
  const existing = await db.select().from(kycRecordsTable)
    .where(and(eq(kycRecordsTable.userId, userId), eq(kycRecordsTable.level, lvl), eq(kycRecordsTable.status, "pending")))
    .limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "You already have a pending submission for this level" }); return; }

  const [rec] = await db.insert(kycRecordsTable).values({
    userId,
    level: lvl,
    status: "pending",
    fullName: recordValues.fullName,
    dob: recordValues.dob,
    address: recordValues.address,
    panNumber: recordValues.panNumber,
    aadhaarNumber: recordValues.aadhaarNumber,
    panDocUrl: recordValues.panDocUrl,
    aadhaarDocUrl: recordValues.aadhaarDocUrl,
    aadhaarDocBackUrl: recordValues.aadhaarDocBackUrl,
    selfieUrl: recordValues.selfieUrl,
    extra: JSON.stringify(extraValues),
  }).returning();
  res.status(201).json(rec);
});

// ─── Referral stats ───────────────────────────────────────────────────────────
router.get("/refer/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const [me, countRows, referredUsers, bonusRows, referralConfig] = await Promise.all([
    db.select({ code: usersTable.referralCode }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db.select({ c: sql<number>`count(*)::int` }).from(usersTable).where(eq(usersTable.referredBy, userId)),
    db.select({ id: usersTable.id, name: usersTable.name, kycLevel: usersTable.kycLevel, createdAt: usersTable.createdAt })
      .from(usersTable).where(eq(usersTable.referredBy, userId)).orderBy(desc(usersTable.createdAt)).limit(50),
    db.select({ bonusAmount: referralsTable.bonusAmount, bonusCredited: referralsTable.bonusCredited })
      .from(referralsTable).where(eq(referralsTable.referrerId, userId)),
    loadReferralConfig(),
  ]);

  // Sum all credited bonuses (bonusCredited=true means wallet was already topped up)
  const creditedEarnings = bonusRows
    .filter(r => r.bonusCredited)
    .reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  // Also include uncredited (pending) so user can see total accrued
  const totalEarnings = bonusRows
    .reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);

  const referredCount = countRows[0]?.c ?? 0;

  // Commission history — all trading/AI/earn rows with full detail for Invite page
  const allBonusRows = await db
    .select({
      id:           referralsTable.id,
      sourceType:   referralsTable.sourceType,
      sourceRefId:  referralsTable.sourceRefId,
      bonusAmount:  referralsTable.bonusAmount,
      bonusCredited:referralsTable.bonusCredited,
      level:        referralsTable.level,
      referredId:   referralsTable.referredId,
      createdAt:    referralsTable.createdAt,
    })
    .from(referralsTable)
    .where(and(
      eq(referralsTable.referrerId, userId),
      sql`${referralsTable.sourceType} IN ('trading_fee','futures_fee','ai_trading','earn_plan')`,
    ))
    .orderBy(sql`${referralsTable.createdAt} DESC`)
    .limit(200);

  const referredKycCount = referredUsers.filter(u => (u.kycLevel ?? 0) >= 1).length;
  const { computeReferralTier } = await import("./admin-referrals");
  const currentTier = computeReferralTier(referredKycCount, referralConfig.tiers);

  res.json({
    referralCode:      me[0]?.code ?? null,
    referredCount,
    referredKycCount,
    estimatedEarnings: parseFloat(totalEarnings.toFixed(4)),
    creditedEarnings:  parseFloat(creditedEarnings.toFixed(4)),
    commissionPct:     currentTier.pct,
    tiers:             referralConfig.tiers,
    currentTierName:   currentTier.name,
    recent:            referredUsers,
    commissions:       allBonusRows.map(r => ({
      id:           r.id,
      sourceType:   r.sourceType,
      sourceRefId:  r.sourceRefId ?? null,
      bonusAmount:  r.bonusAmount ?? "0",
      bonusCredited:r.bonusCredited,
      level:        r.level,
      referredId:   r.referredId,
      createdAt:    r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  });
});

// ─── OTP-protected withdraw confirm (optional convenience) ────────────────────
// Real OTP wiring lives inside the withdraw POSTs above when an `otpId` is supplied.

// ─── Payment gateways (public list — only active deposit gateways) ────────────
router.get("/gateways", async (req, res): Promise<void> => {
  const direction = typeof req.query.direction === "string" ? req.query.direction : "deposit";
  const rows = await db
    .select({
      id: gatewaysTable.id, code: gatewaysTable.code, name: gatewaysTable.name,
      type: gatewaysTable.type, direction: gatewaysTable.direction,
      minAmount: gatewaysTable.minAmount, maxAmount: gatewaysTable.maxAmount,
      feeFlat: gatewaysTable.feeFlat, feePercent: gatewaysTable.feePercent,
      processingTime: gatewaysTable.processingTime, isAuto: gatewaysTable.isAuto,
      config: gatewaysTable.config,
    })
    .from(gatewaysTable)
    .where(and(eq(gatewaysTable.status, "active"), eq(gatewaysTable.direction, direction)))
    .orderBy(gatewaysTable.id);
  res.json(rows);
});

// ─── INR Deposits ─────────────────────────────────────────────────────────────
router.get("/inr-deposits", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(inrDepositsTable)
    .where(eq(inrDepositsTable.userId, req.user!.id))
    .orderBy(desc(inrDepositsTable.createdAt));
  res.json(rows);
});

router.post("/inr-deposits", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { gatewayId, amount, utr, notes } = req.body ?? {};
  const amt = Number(amount);
  if (!gatewayId || !Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "gatewayId and positive amount required" }); return;
  }
  const [g] = await db.select().from(gatewaysTable).where(eq(gatewaysTable.id, Number(gatewayId))).limit(1);
  if (!g) { res.status(404).json({ error: "Gateway not found" }); return; }
  if (g.status !== "active" || g.direction !== "deposit") {
    res.status(400).json({ error: "Gateway not available for deposits" }); return;
  }
  const min = Number(g.minAmount), max = Number(g.maxAmount);
  if (min > 0 && amt < min) { res.status(400).json({ error: `Minimum deposit is ₹${min}` }); return; }
  if (max > 0 && amt > max) { res.status(400).json({ error: `Maximum deposit is ₹${max}` }); return; }

  // Manual gateways (UPI/IMPS/NEFT/RTGS) need a UTR claim. Auto gateways may not.
  if (!g.isAuto && (!utr || String(utr).trim().length < 6)) {
    res.status(400).json({ error: "UTR / Transaction reference required (min 6 chars)" }); return;
  }

  const fee = +(Number(g.feeFlat) + (amt * Number(g.feePercent) / 100)).toFixed(2);
  const refId = `DINR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  try {
    const [row] = await db.insert(inrDepositsTable).values({
      userId, gatewayId: Number(gatewayId), amount: String(amt), fee: String(fee),
      refId, utr: utr ? String(utr).trim() : null, status: "pending",
      notes: notes ? String(notes).slice(0, 500) : null,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (typeof e?.message === "string" && e.message.includes("ref_id")) {
      res.status(409).json({ error: "Duplicate reference, please retry" }); return;
    }
    throw e;
  }
});

// ─── Crypto Deposits ──────────────────────────────────────────────────────────
router.get("/crypto-deposits", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(cryptoDepositsTable)
    .where(eq(cryptoDepositsTable.userId, req.user!.id))
    .orderBy(desc(cryptoDepositsTable.createdAt));
  res.json(rows);
});

router.post("/crypto-deposits/notify", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { coinId, networkId, amount, txHash } = req.body ?? {};
  const amt = Number(amount);
  if (!coinId || !networkId || !Number.isFinite(amt) || amt <= 0 || !txHash) {
    res.status(400).json({ error: "coinId, networkId, positive amount, txHash required" }); return;
  }
  const tx = String(txHash).trim();
  if (tx.length < 10) { res.status(400).json({ error: "Invalid txHash" }); return; }

  const [network] = await db.select().from(networksTable).where(eq(networksTable.id, Number(networkId))).limit(1);
  if (!network) { res.status(404).json({ error: "Network not found" }); return; }
  if (network.coinId !== Number(coinId)) { res.status(400).json({ error: "Network does not belong to this coin" }); return; }
  if (network.status !== "active") { res.status(400).json({ error: "Network is not active" }); return; }
  const minDep = Number(network.minDeposit ?? 0);
  if (minDep > 0 && amt < minDep) { res.status(400).json({ error: `Minimum deposit is ${minDep}` }); return; }

  // Reuse user's deterministic address (must already exist via /deposit-address)
  const [addr] = await db.select().from(depositAddressesTable).where(and(
    eq(depositAddressesTable.userId, userId),
    eq(depositAddressesTable.coinId, Number(coinId)),
    eq(depositAddressesTable.networkId, Number(networkId)),
  )).limit(1);
  if (!addr) { res.status(400).json({ error: "Generate a deposit address first" }); return; }

  // Idempotency: reject if a deposit with this txHash on this network already exists
  const [dup] = await db.select({ id: cryptoDepositsTable.id }).from(cryptoDepositsTable).where(and(
    eq(cryptoDepositsTable.networkId, Number(networkId)),
    eq(cryptoDepositsTable.txHash, tx),
  )).limit(1);
  if (dup) { res.status(409).json({ error: "This transaction hash has already been submitted" }); return; }

  const [row] = await db.insert(cryptoDepositsTable).values({
    userId, coinId: Number(coinId), networkId: Number(networkId),
    amount: String(amt), address: addr.address, txHash: tx,
    confirmations: 0, status: "pending",
    detectedBy: "user_claim",
  }).returning();

  // Fire-and-forget: auto-verify on-chain; if valid + confirmed → credits immediately
  void autoVerifyUserDeposit(row.id).catch(() => {/* logged inside */});

  res.status(201).json({
    ...row,
    message: "Deposit submitted — verifying on-chain. You will be credited automatically if the transaction is valid.",
  });
});

export default router;
