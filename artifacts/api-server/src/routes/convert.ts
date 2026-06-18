// Instant Convert: 10s-locked quotes; idempotent execute via FOR UPDATE on
// the quote row + status column as source of truth.

import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, walletsTable, coinsTable, usersTable, convertQuotesTable, walletLedgerTable, settingsTable,
} from "@workspace/db";
import { COMPANY_ADDRESS, COMPANY_GST, COMPANY_PAN, COMPANY_CIN } from "../lib/company";
import { requireAuth } from "../middlewares/auth";
import { getConvertFeeRate } from "./fees";
import { getCache, getInrRate } from "../lib/price-service";

const router: IRouter = Router();

const QUOTE_TTL_MS = 10_000;
/** Minimum convert size in USDT-equivalent. Below this the spread + fees
 *  stop making economic sense and we'd be paying out more than we collect. */
const MIN_USDT_NOTIONAL = 1;
/** Spread we charge as the LP (top of fee). Keeps convert profitable even
 *  when the price feed jumps between quote and execute. */
const SPREAD = 0.001; // 0.10%

const QuoteBody = z.object({
  fromCoin: z.string().trim().min(1).max(20),
  toCoin: z.string().trim().min(1).max(20),
  fromAmount: z.coerce.number().positive().finite().max(1e12),
});

const ExecuteBody = z.object({
  quoteId: z.coerce.number().int().positive(),
});

/** Compute the USD price of a coin. Anchored on the in-mem feed (which is
 *  the same source the spot router uses for last-price), so convert can't
 *  silently drift away from spot quotes. INR is priced via the configured
 *  USDT/INR rate; USDT/USD are 1.0. */
function priceUsd(symbol: string): number {
  if (symbol === "USDT" || symbol === "USD") return 1;
  if (symbol === "INR") {
    const r = getInrRate();
    return r > 0 ? 1 / r : 0;
  }
  const tick = getCache().find((x) => x.symbol === symbol);
  return tick ? Number(tick.usdt) || 0 : 0;
}

router.post("/convert/quote", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to use Quick Convert" }); return;
  }
  const parsed = QuoteBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }
  const fromSym = parsed.data.fromCoin.toUpperCase();
  const toSym = parsed.data.toCoin.toUpperCase();
  if (fromSym === toSym) {
    res.status(400).json({ error: "fromCoin and toCoin must differ" });
    return;
  }
  const amt = parsed.data.fromAmount;

  const [from] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, fromSym)).limit(1);
  const [to]   = await db.select().from(coinsTable).where(eq(coinsTable.symbol, toSym)).limit(1);
  if (!from) { res.status(400).json({ error: `Unknown coin ${fromSym}` }); return; }
  if (!to)   { res.status(400).json({ error: `Unknown coin ${toSym}` }); return; }
  if (from.status !== "active" || !from.isListed) {
    res.status(400).json({ error: `${fromSym} is not currently tradable` }); return;
  }
  if (to.status !== "active" || !to.isListed) {
    res.status(400).json({ error: `${toSym} is not currently tradable` }); return;
  }

  const fromUsd = priceUsd(fromSym);
  const toUsd   = priceUsd(toSym);
  if (fromUsd <= 0 || toUsd <= 0) {
    res.status(503).json({ error: "Live price unavailable for one of the assets — try again shortly" });
    return;
  }

  const notionalUsd = amt * fromUsd;
  if (notionalUsd < MIN_USDT_NOTIONAL) {
    const minFrom = MIN_USDT_NOTIONAL / fromUsd;
    res.status(400).json({
      error: `Minimum convert size is $${MIN_USDT_NOTIONAL} (≈ ${minFrom.toFixed(8)} ${fromSym})`,
    });
    return;
  }

  const [u] = await db.select({ vipTier: usersTable.vipTier })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const vipTier = Math.max(0, Math.min(50, Number(u?.vipTier ?? 0)));
  const { rate: feeRate, bps: feeBps, tier } = await getConvertFeeRate(vipTier);

  // Spread comes off the top, then we deduct the fee from the gross OUT.
  const rawRate = fromUsd / toUsd;
  const effectiveRate = rawRate * (1 - SPREAD);
  const grossOut = amt * effectiveRate;
  const feeAmount = grossOut * feeRate;
  const netOut = Math.max(0, grossOut - feeAmount);

  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
  const [row] = await db.insert(convertQuotesTable).values({
    userId,
    fromCoinId: from.id,
    toCoinId: to.id,
    fromAmount: String(amt),
    toAmount: netOut.toFixed(8),
    rate: effectiveRate.toFixed(8),
    feeAmount: feeAmount.toFixed(8),
    feeBps,
    vipTier,
    status: "pending",
    expiresAt,
  }).returning();

  req.log.debug({ userId, quoteId: row.id, fromSym, toSym }, "convert quote issued");

  res.json({
    quoteId: row.id,
    uid: row.uid,
    fromCoin: fromSym,
    toCoin: toSym,
    fromAmount: amt,
    toAmount: Number(netOut.toFixed(8)),
    rate: Number(effectiveRate.toFixed(8)),
    feeAmount: Number(feeAmount.toFixed(8)),
    feePercent: Number((feeRate * 100).toFixed(4)),
    feeBps,
    spreadPercent: SPREAD * 100,
    vipTier,
    tierName: tier.name,
    expiresAt: expiresAt.toISOString(),
    ttlMs: QUOTE_TTL_MS,
  });
});

router.post("/convert/execute", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const parsed = ExecuteBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  // Return (don't throw) for terminal states so the status update commits.
  type ExecResult =
    | { kind: "ok"; row: typeof convertQuotesTable.$inferSelect }
    | { kind: "fail"; code: number; message: string };

  let result: ExecResult;
  try {
    result = await db.transaction<ExecResult>(async (tx) => {
      const [q] = await tx.select().from(convertQuotesTable)
        .where(and(
          eq(convertQuotesTable.id, parsed.data.quoteId),
          eq(convertQuotesTable.userId, userId),
        ))
        .for("update").limit(1);
      if (!q) return { kind: "fail", code: 404, message: "Quote not found" };
      if (q.status === "executed") {
        return { kind: "fail", code: 409, message: "Quote already executed" };
      }
      if (q.status !== "pending") {
        return { kind: "fail", code: 409, message: `Quote ${q.status}` };
      }
      if (new Date(q.expiresAt).getTime() < Date.now()) {
        // Persist the terminal state — returning (not throwing) commits it.
        await tx.update(convertQuotesTable)
          .set({ status: "expired" })
          .where(eq(convertQuotesTable.id, q.id));
        return { kind: "fail", code: 410, message: "Quote expired — refresh the rate and try again" };
      }

      const [src] = await tx.select().from(walletsTable)
        .where(and(
          eq(walletsTable.userId, userId),
          eq(walletsTable.coinId, q.fromCoinId),
          eq(walletsTable.walletType, "spot"),
        ))
        .for("update").limit(1);
      if (!src) {
        const e: any = new Error("No spot wallet for source asset"); e.code = 400; throw e;
      }
      const fromAmt = Number(q.fromAmount);
      if (Number(src.balance) + 1e-12 < fromAmt) {
        const e: any = new Error(`Insufficient balance (have ${Number(src.balance).toFixed(8)})`);
        e.code = 400; throw e;
      }

      // Lock or create destination spot wallet.
      const [dstExisting] = await tx.select().from(walletsTable)
        .where(and(
          eq(walletsTable.userId, userId),
          eq(walletsTable.coinId, q.toCoinId),
          eq(walletsTable.walletType, "spot"),
        ))
        .for("update").limit(1);
      let dstId: number;
      if (dstExisting) {
        dstId = dstExisting.id;
      } else {
        const [created] = await tx.insert(walletsTable).values({
          userId, coinId: q.toCoinId, walletType: "spot",
          balance: "0", locked: "0", p2pLocked: "0",
        }).returning();
        dstId = created.id;
      }

      const srcBalBefore = String(src.balance);
      const toAmt        = Number(q.toAmount);
      const dstBalBefore = String(dstExisting?.balance ?? "0");

      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} - ${q.fromAmount}::numeric`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, src.id));

      await tx.update(walletsTable).set({
        balance: sql`${walletsTable.balance} + ${q.toAmount}::numeric`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, dstId));

      // Ledger: convert debit (from) + convert credit (to)
      await tx.insert(walletLedgerTable).values([
        {
          userId, coinId: q.fromCoinId, walletType: "spot", type: "convert",
          amount: String(-fromAmt),
          balanceBefore: srcBalBefore, balanceAfter: String(Number(srcBalBefore) - fromAmt),
          refType: "convert_quote", refId: String(q.id), note: "Convert: sent",
        },
        {
          userId, coinId: q.toCoinId, walletType: "spot", type: "convert",
          amount: String(toAmt),
          balanceBefore: dstBalBefore, balanceAfter: String(Number(dstBalBefore) + toAmt),
          refType: "convert_quote", refId: String(q.id), note: "Convert: received",
        },
      ]);

      const [updated] = await tx.update(convertQuotesTable).set({
        status: "executed",
        executedAt: new Date(),
      }).where(eq(convertQuotesTable.id, q.id)).returning();
      return { kind: "ok", row: updated };
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }

  if (result.kind === "fail") {
    res.status(result.code).json({ error: result.message });
    return;
  }

  const row = result.row;
  req.log.info({
    userId, quoteId: row.id,
    fromAmount: row.fromAmount, toAmount: row.toAmount,
  }, "convert executed");

  res.json({
    ok: true,
    quoteId: row.id,
    uid: row.uid,
    executedAt: row.executedAt,
    fromAmount: Number(row.fromAmount),
    toAmount: Number(row.toAmount),
    rate: Number(row.rate),
    feeAmount: Number(row.feeAmount),
  });
});

// ─── /convert/:id/invoice ────────────────────────────────────────────────────
router.get("/convert/:id/invoice", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const quoteId = Number(req.params.id);
  if (!Number.isFinite(quoteId) || quoteId <= 0) {
    res.status(400).json({ message: "Invalid convert id" }); return;
  }

  const [q] = await db.select().from(convertQuotesTable)
    .where(and(eq(convertQuotesTable.id, quoteId), eq(convertQuotesTable.userId, userId)))
    .limit(1);
  if (!q) { res.status(404).json({ message: "Convert record not found" }); return; }
  if (q.status !== "executed") {
    res.status(400).json({ message: "Invoice is only available for completed conversions" }); return;
  }

  const coins = await db.select().from(coinsTable);
  const fromCoin = coins.find(c => c.id === q.fromCoinId);
  const toCoin   = coins.find(c => c.id === q.toCoinId);

  const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const settingsRows = await db.select().from(settingsTable);
  const brandMap = new Map(settingsRows.map(r => [r.key, r.value]));
  const brand = {
    legalName:    brandMap.get("brand.legal_name")    || "Zebvix Technologies Private Limited",
    tradingName:  brandMap.get("brand.trading_name")  || "Zebvix Exchange",
    address:      brandMap.get("brand.address")       || COMPANY_ADDRESS,
    gstin:        brandMap.get("brand.gstin")         || COMPANY_GST,
    pan:          brandMap.get("brand.pan")           || COMPANY_PAN,
    cin:          brandMap.get("brand.cin")           || COMPANY_CIN,
    supportEmail: brandMap.get("brand.support_email") || "support@zebvix.com",
    website:      brandMap.get("brand.website")       || "https://zebvix.com",
  };

  const fromAmt  = Number(q.fromAmount);
  const toAmt    = Number(q.toAmount);
  const feeAmt   = Number(q.feeAmount);
  const rate     = Number(q.rate);
  const feeBps   = q.feeBps ?? 0;

  res.json({
    invoiceNo: `CVT-${String(q.id).padStart(8, "0")}`,
    issuedAt:  q.executedAt ?? q.createdAt,
    brand,
    customer:  { name: u?.name || "—", email: u?.email || "—", userId },
    convert: {
      id:        q.id,
      uid:       q.uid,
      fromCoin:  fromCoin?.symbol ?? "—",
      toCoin:    toCoin?.symbol   ?? "—",
      fromAmount: fromAmt,
      toAmount:   toAmt,
      rate,
      feeAmount:  feeAmt,
      feeBps,
      feePercent: +(feeBps / 100).toFixed(4),
      grossOut:   +(toAmt + feeAmt).toFixed(8),
      executedAt: q.executedAt,
      createdAt:  q.createdAt,
    },
  });
});

router.get("/convert/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  req.log.debug({ userId }, "convert history list");

  const rows = await db
    .select({
      id: convertQuotesTable.id,
      uid: convertQuotesTable.uid,
      fromCoinId: convertQuotesTable.fromCoinId,
      toCoinId: convertQuotesTable.toCoinId,
      fromAmount: convertQuotesTable.fromAmount,
      toAmount: convertQuotesTable.toAmount,
      rate: convertQuotesTable.rate,
      feeAmount: convertQuotesTable.feeAmount,
      vipTier: convertQuotesTable.vipTier,
      status: convertQuotesTable.status,
      expiresAt: convertQuotesTable.expiresAt,
      executedAt: convertQuotesTable.executedAt,
      createdAt: convertQuotesTable.createdAt,
      fromSymbol: sql<string>`(SELECT symbol FROM coins WHERE id = ${convertQuotesTable.fromCoinId})`.as("from_symbol"),
      toSymbol: sql<string>`(SELECT symbol FROM coins WHERE id = ${convertQuotesTable.toCoinId})`.as("to_symbol"),
    })
    .from(convertQuotesTable)
    .where(eq(convertQuotesTable.userId, userId))
    .orderBy(desc(convertQuotesTable.createdAt))
    .limit(100);

  res.json(rows.map((r) => ({
    id: r.id,
    uid: r.uid,
    fromCoin: r.fromSymbol,
    toCoin: r.toSymbol,
    fromAmount: Number(r.fromAmount),
    toAmount: Number(r.toAmount),
    rate: Number(r.rate),
    feeAmount: Number(r.feeAmount),
    vipTier: r.vipTier,
    status: r.status,
    expiresAt: r.expiresAt,
    executedAt: r.executedAt,
    createdAt: r.createdAt,
  })));
});

export default router;
