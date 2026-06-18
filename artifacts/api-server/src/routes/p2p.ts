import { Router, type IRouter } from "express";
import { eq, and, or, desc, asc, sql, ne, gt, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  p2pOffersTable,
  p2pOrdersTable,
  p2pMessagesTable,
  p2pPaymentMethodsTable,
  p2pDisputesTable,
  p2pRatingsTable,
  walletsTable,
  coinsTable,
  usersTable,
  walletLedgerTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { lockEscrow, releaseEscrow, refundEscrow, quantizeQty, lockAdFunds, unlockAdFunds } from "../lib/p2p-escrow";
import { logAdminAction } from "../lib/audit";

const router: IRouter = Router();
const adminOnly = requireRole("admin", "superadmin");
const supportPlus = requireRole("admin", "superadmin", "support");

class AppError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}
const bad = (msg: string) => new AppError(400, msg);
const notFound = (msg: string) => new AppError(404, msg);
const forbidden = (msg: string) => new AppError(403, msg);

const PAYMENT_METHOD_TYPES = ["upi", "imps", "neft", "bank", "paytm", "phonepe", "gpay"] as const;
type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];
const OFFER_SIDES = ["buy", "sell"] as const;
type OfferSide = (typeof OFFER_SIDES)[number];
const ORDER_STATUSES = ["pending", "paid", "released", "cancelled", "disputed", "expired"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

type OfferRow = typeof p2pOffersTable.$inferSelect;
type OrderRow = typeof p2pOrdersTable.$inferSelect;
type UserRow = typeof usersTable.$inferSelect;
type MerchantRow = Pick<UserRow, "id" | "name" | "email" | "kycLevel" | "vipTier" | "createdAt">;

async function getCoinBySymbol(sym: string) {
  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, sym.toUpperCase())).limit(1);
  if (!coin) throw notFound(`Coin ${sym} not found`);
  return coin;
}

function sendError(res: import("express").Response, e: unknown): boolean {
  // Accept any error that carries a numeric `httpStatus` — covers AppError
  // (this file) and EscrowError (lib/p2p-escrow) so business-rule failures
  // like "insufficient seller balance" surface as clean 4xx instead of 500s.
  if (e && typeof e === "object" && e instanceof Error) {
    const status = (e as Error & { httpStatus?: unknown }).httpStatus;
    if (typeof status === "number" && status >= 400 && status < 600) {
      res.status(status).json({ error: e.message });
      return true;
    }
  }
  return false;
}

function publicMerchantView(u: MerchantRow | undefined) {
  const rawName = (u?.name ?? "").trim();
  const name = rawName || (u?.email ? u.email.split("@")[0] : "Trader");
  return {
    id: u?.id,
    name,
    handle: name.length > 1 ? `${name[0]}${"*".repeat(Math.max(2, name.length - 2))}${name[name.length - 1]}` : name,
    kycLevel: u?.kycLevel ?? 0,
    vipTier: u?.vipTier ?? 0,
    createdAt: u?.createdAt,
  };
}

async function hydrateOffers(rows: OfferRow[]) {
  if (!rows.length) return [];
  const coinIds = Array.from(new Set(rows.map(r => r.coinId)));
  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const [coins, users] = await Promise.all([
    db.select().from(coinsTable).where(inArray(coinsTable.id, coinIds)),
    db.select().from(usersTable).where(inArray(usersTable.id, userIds)),
  ]);
  const coinById = new Map(coins.map(c => [c.id, c]));
  const userById = new Map(users.map(u => [u.id, u]));
  return rows.map(r => ({
    ...r,
    price: Number(r.price),
    totalQty: Number(r.totalQty),
    availableQty: Number(r.availableQty),
    minFiat: Number(r.minFiat),
    maxFiat: Number(r.maxFiat),
    paymentMethods: String(r.paymentMethods || "").split(",").filter(Boolean),
    coin: coinById.get(r.coinId) ? {
      id: coinById.get(r.coinId)!.id,
      symbol: coinById.get(r.coinId)!.symbol,
      name: coinById.get(r.coinId)!.name,
    } : null,
    merchant: publicMerchantView(userById.get(r.userId)),
  }));
}

// Payment methods (per-user)

router.get("/p2p/payment-methods", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(p2pPaymentMethodsTable)
    .where(and(eq(p2pPaymentMethodsTable.userId, req.user!.id), eq(p2pPaymentMethodsTable.active, true)))
    .orderBy(desc(p2pPaymentMethodsTable.createdAt));
  req.log.debug({ userId: req.user!.id, count: rows.length }, "p2p payment methods listed");
  res.json(rows);
});

const PaymentMethodBody = z.object({
  method: z.enum(PAYMENT_METHOD_TYPES),
  label: z.string().min(2).max(60),
  account: z.string().min(3).max(120),
  ifsc: z.string().min(4).max(20).optional(),
  holderName: z.string().min(2).max(80).optional(),
}).strict();

router.post("/p2p/payment-methods", requireAuth, async (req, res): Promise<void> => {
  const parsed = PaymentMethodBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  // Bank-rail methods need IFSC + holder name; UPI/wallet methods don't.
  const needsBank = parsed.data.method === "imps" || parsed.data.method === "neft" || parsed.data.method === "bank";
  if (needsBank && (!parsed.data.ifsc || !parsed.data.holderName)) {
    res.status(400).json({ error: "ifsc and holderName required for bank methods" }); return;
  }
  const [created] = await db.insert(p2pPaymentMethodsTable).values({
    userId: req.user!.id,
    method: parsed.data.method,
    label: parsed.data.label,
    account: parsed.data.account,
    ifsc: parsed.data.ifsc ?? null,
    holderName: parsed.data.holderName ?? null,
  }).returning();
  req.log.info({ userId: req.user!.id, paymentMethodId: created.id, method: parsed.data.method }, "p2p payment method created");
  res.status(201).json(created);
});

router.delete("/p2p/payment-methods/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Soft-delete: keep row so historical orders can still display the
  // payment label that was used at deal time.
  const [updated] = await db.update(p2pPaymentMethodsTable)
    .set({ active: false })
    .where(and(eq(p2pPaymentMethodsTable.id, id), eq(p2pPaymentMethodsTable.userId, req.user!.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Payment method not found" }); return; }
  req.log.info({ userId: req.user!.id, paymentMethodId: id }, "p2p payment method deactivated");
  res.json({ ok: true });
});

// Offers (Ads) — browse is auth-gated so we can hide PII consistently.
router.get("/p2p/offers", requireAuth, async (req, res): Promise<void> => {
  const side = String(req.query.side || "sell").toLowerCase();
  const coin = String(req.query.coin || "").toUpperCase();
  const fiat = String(req.query.fiat || "INR").toUpperCase();
  const method = String(req.query.method || "").toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  req.log.debug({ userId: req.user!.id, side, coin, fiat, method, limit }, "p2p offers browse");

  if (!(OFFER_SIDES as readonly string[]).includes(side)) { res.status(400).json({ error: "side must be buy/sell" }); return; }
  // Initial rollout is INR-only — reject other fiats at the listing boundary
  // so callers can't fish for offers in unsupported currencies.
  if (fiat !== "INR") { res.status(400).json({ error: "Only INR is supported in this release" }); return; }

  const conds: SQL[] = [
    eq(p2pOffersTable.side, side),
    eq(p2pOffersTable.fiat, fiat),
    eq(p2pOffersTable.status, "online"),
    gt(p2pOffersTable.availableQty, "0"),
    // Hide own offers from browsing — merchants shouldn't see/match their own ads.
    ne(p2pOffersTable.userId, req.user!.id),
  ];
  if (coin) {
    const c = await db.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, coin)).limit(1);
    if (!c.length) { res.json([]); return; }
    conds.push(eq(p2pOffersTable.coinId, c[0].id));
  }
  if (method) {
    if (!(PAYMENT_METHOD_TYPES as readonly string[]).includes(method)) { res.status(400).json({ error: "Invalid method" }); return; }
    // payment_methods stored as comma-list — match via ILIKE on the joined string.
    conds.push(sql`${p2pOffersTable.paymentMethods} ILIKE ${'%' + method + '%'}`);
  }

  // SELL ads (merchant selling crypto) → buyer wants LOWEST price first.
  // BUY  ads (merchant buying crypto)  → seller wants HIGHEST price first.
  const orderBy = side === "sell" ? asc(p2pOffersTable.price) : desc(p2pOffersTable.price);
  const rows = await db.select().from(p2pOffersTable).where(and(...conds)).orderBy(orderBy).limit(limit);
  res.json(await hydrateOffers(rows));
});

// My ads (online + offline + closed)
router.get("/p2p/offers/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(p2pOffersTable)
    .where(eq(p2pOffersTable.userId, req.user!.id))
    .orderBy(desc(p2pOffersTable.createdAt))
    .limit(200);
  req.log.debug({ userId: req.user!.id, count: rows.length }, "p2p own offers listed");
  res.json(await hydrateOffers(rows));
});

router.get("/p2p/offers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [offer] = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.id, id)).limit(1);
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  req.log.debug({ userId: req.user!.id, offerId: id }, "p2p offer fetched");
  const [hydrated] = await hydrateOffers([offer]);
  res.json(hydrated);
});

/**
 * For SELL offers, the buyer (counterparty) needs to pick which of the
 * MERCHANT's saved payment methods to use. To preserve some privacy we
 * only return id/method/label — not the account number — until the
 * order is opened, at which point the order row carries the snapshot.
 */
router.get("/p2p/offers/:id/seller-methods", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [offer] = await db.select().from(p2pOffersTable).where(eq(p2pOffersTable.id, id)).limit(1);
  if (!offer) { res.status(404).json({ error: "Offer not found" }); return; }
  if (offer.userId === req.user!.id) {
    res.status(400).json({ error: "Cannot trade your own offer" }); return;
  }
  // Only relevant for SELL offers (where the counterparty is the buyer).
  // For BUY offers the counterparty (seller) supplies their OWN method.
  if (offer.side !== "sell") { res.json([]); return; }
  const rows = await db.select({
    id: p2pPaymentMethodsTable.id,
    method: p2pPaymentMethodsTable.method,
    label: p2pPaymentMethodsTable.label,
  }).from(p2pPaymentMethodsTable)
    .where(and(eq(p2pPaymentMethodsTable.userId, offer.userId), eq(p2pPaymentMethodsTable.active, true)))
    .limit(20);
  // If the seller pinned specific method IDs on the offer, show only those.
  // Otherwise fall back to type-based filtering (paymentMethods types).
  const pinnedIds = String(offer.paymentMethodIds || "").split(",").map(Number).filter(Boolean);
  const filtered = pinnedIds.length > 0
    ? rows.filter(r => pinnedIds.includes(r.id))
    : rows.filter(r => String(offer.paymentMethods || "").split(",").filter(Boolean).includes(r.method));
  req.log.debug({ userId: req.user!.id, offerId: id, count: filtered.length }, "p2p seller methods fetched");
  res.json(filtered);
});

const OfferBody = z.object({
  side: z.enum(OFFER_SIDES),
  coinSymbol: z.string().min(1).max(20),
  // Initial rollout is INR-only — locked to a single literal so the API
  // can't be used to seed offers in unsupported currencies. Widen this
  // enum when multi-fiat support lands.
  fiat: z.literal("INR").default("INR"),
  price: z.coerce.number().finite().positive(),
  totalQty: z.coerce.number().finite().positive(),
  minFiat: z.coerce.number().finite().positive(),
  maxFiat: z.coerce.number().finite().positive(),
  paymentMethods: z.array(z.enum(PAYMENT_METHOD_TYPES)).min(1).max(7),
  // Specific saved payment-method IDs the seller has pinned for this ad.
  // When set, /seller-methods returns only those accounts; otherwise all
  // active accounts matching the paymentMethods types are shown.
  paymentMethodIds: z.array(z.number().int().positive()).max(20).optional(),
  // Initial rollout fixes the pay window at 15 minutes (matches the
  // task spec). Schema is a literal so the API can't be used to widen
  // or shrink it; widen this when configurable windows ship.
  payWindowMins: z.literal(15).default(15),
  terms: z.string().max(500).optional(),
  minKycLevel: z.coerce.number().int().min(0).max(3).default(1),
  minTrades: z.coerce.number().int().min(0).max(10000).default(0),
}).strict().superRefine((d, ctx) => {
  if (d.maxFiat < d.minFiat) ctx.addIssue({ code: "custom", path: ["maxFiat"], message: "maxFiat must be >= minFiat" });
  // Sanity: order amount must be reachable within total liquidity.
  if (d.minFiat > d.totalQty * d.price) ctx.addIssue({ code: "custom", path: ["minFiat"], message: "minFiat exceeds total liquidity (totalQty*price)" });
});

router.post("/p2p/offers", requireAuth, async (req, res): Promise<void> => {
  const parsed = OfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const d = parsed.data;
  const u = req.user!;
  if (u.kycLevel < 1) { res.status(403).json({ error: "KYC Level 1 required to post P2P ads" }); return; }
  try {
    const coin = await getCoinBySymbol(d.coinSymbol);
    const qtyStr = quantizeQty(d.totalQty);

    const created = await db.transaction(async (tx) => {
      // Insert the offer first so we have its ID for the ledger refId.
      const [row] = await tx.insert(p2pOffersTable).values({
        userId: u.id,
        side: d.side,
        coinId: coin.id,
        fiat: d.fiat.toUpperCase(),
        price: String(d.price),
        totalQty: qtyStr,
        availableQty: qtyStr,
        minFiat: String(d.minFiat),
        maxFiat: String(d.maxFiat),
        paymentMethods: d.paymentMethods.join(","),
        paymentMethodIds: d.paymentMethodIds?.length ? d.paymentMethodIds.join(",") : null,
        payWindowMins: d.payWindowMins,
        terms: d.terms ?? null,
        minKycLevel: d.minKycLevel,
        minTrades: d.minTrades,
        status: "online",
      }).returning();

      if (d.side === "sell") {
        // Lock totalQty upfront — funds stay in p2pLocked for the ad's lifetime.
        // Snapshot balance BEFORE the lock (lockAdFunds does FOR UPDATE internally).
        const [wPre] = await tx.select({ balance: walletsTable.balance })
          .from(walletsTable)
          .where(and(eq(walletsTable.userId, u.id), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "spot")))
          .limit(1);
        const balBefore = wPre?.balance ?? "0";
        const balAfter  = String((Number(balBefore) - Number(qtyStr)).toFixed(8));
        await lockAdFunds(tx, u.id, coin.id, qtyStr);
        await tx.insert(walletLedgerTable).values({
          userId: u.id, coinId: coin.id, walletType: "spot", type: "p2p_debit",
          amount: (-Number(qtyStr)).toFixed(8),
          balanceBefore: balBefore, balanceAfter: balAfter,
          refType: "p2p_offer", refId: String(row.id),
          note: "P2P sell ad created — total qty locked",
        });
      }
      return row;
    });

    req.log.info({ offerId: created.id, userId: u.id, side: d.side, coin: coin.symbol, qty: d.totalQty }, "p2p offer created");
    const [hydrated] = await hydrateOffers([created]);
    res.status(201).json(hydrated);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message }, "p2p offer create failed");
    throw e;
  }
});

const OfferPatchBody = z.object({
  status: z.enum(["online", "offline", "closed"]).optional(),
  price: z.coerce.number().finite().positive().optional(),
  minFiat: z.coerce.number().finite().positive().optional(),
  maxFiat: z.coerce.number().finite().positive().optional(),
  terms: z.string().max(500).optional(),
}).strict();

router.patch("/p2p/offers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OfferPatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }

  const [existing] = await db.select().from(p2pOffersTable)
    .where(and(eq(p2pOffersTable.id, id), eq(p2pOffersTable.userId, req.user!.id)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Offer not found" }); return; }
  if (existing.status === "suspended") { res.status(403).json({ error: "Suspended by admin — cannot edit" }); return; }

  const newPrice    = parsed.data.price   ?? Number(existing.price);
  const newMinFiat  = parsed.data.minFiat ?? Number(existing.minFiat);
  const newMaxFiat  = parsed.data.maxFiat ?? Number(existing.maxFiat);
  const totalQty    = Number(existing.totalQty);
  if (newMaxFiat < newMinFiat) {
    res.status(400).json({ error: "maxFiat must be >= minFiat" }); return;
  }
  if (newMinFiat > totalQty * newPrice) {
    res.status(400).json({ error: "minFiat exceeds total liquidity (totalQty*price)" }); return;
  }

  const upd: Partial<typeof p2pOffersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.status) upd.status = parsed.data.status;
  if (parsed.data.price != null) upd.price = String(parsed.data.price);
  if (parsed.data.minFiat != null) upd.minFiat = String(parsed.data.minFiat);
  if (parsed.data.maxFiat != null) upd.maxFiat = String(parsed.data.maxFiat);
  if (parsed.data.terms !== undefined) upd.terms = parsed.data.terms || null;

  // If closing a SELL ad, unlock the remaining available qty back to balance.
  const closing = parsed.data.status === "closed" && existing.side === "sell";
  const availQty = Number(existing.availableQty);

  let updated: typeof p2pOffersTable.$inferSelect;
  if (closing && availQty > 0) {
    updated = await db.transaction(async (tx) => {
      const [offerLocked] = await tx.select().from(p2pOffersTable)
        .where(eq(p2pOffersTable.id, id)).for("update").limit(1);
      const avail = Number(offerLocked.availableQty);
      if (avail > 0) {
        const avStr = avail.toFixed(8);
        const [wPre] = await tx.select({ balance: walletsTable.balance, p2pLocked: walletsTable.p2pLocked })
          .from(walletsTable)
          .where(and(eq(walletsTable.userId, req.user!.id), eq(walletsTable.coinId, existing.coinId), eq(walletsTable.walletType, "spot")))
          .limit(1);
        const balBefore = wPre?.balance ?? "0";
        const balAfter  = String((Number(balBefore) + avail).toFixed(8));
        await unlockAdFunds(tx, req.user!.id, existing.coinId, avStr);
        await tx.insert(walletLedgerTable).values({
          userId: req.user!.id, coinId: existing.coinId, walletType: "spot", type: "p2p_credit",
          amount: avail.toFixed(8),
          balanceBefore: balBefore, balanceAfter: balAfter,
          refType: "p2p_offer", refId: String(id), note: "P2P sell ad closed — remaining qty unlocked",
        });
      }
      const [r] = await tx.update(p2pOffersTable).set(upd).where(eq(p2pOffersTable.id, id)).returning();
      return r;
    });
  } else {
    const [r] = await db.update(p2pOffersTable).set(upd).where(eq(p2pOffersTable.id, id)).returning();
    updated = r;
  }

  req.log.info({ offerId: id, userId: req.user!.id, fields: Object.keys(upd) }, "p2p offer patched");
  const [hydrated] = await hydrateOffers([updated]);
  res.json(hydrated);
});

router.delete("/p2p/offers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(p2pOffersTable)
        .where(and(eq(p2pOffersTable.id, id), eq(p2pOffersTable.userId, req.user!.id)))
        .for("update").limit(1);
      if (!existing) throw notFound("Offer not found");
      // Block delete if the offer still has active orders.
      const [openOrder] = await tx.select({ id: p2pOrdersTable.id }).from(p2pOrdersTable)
        .where(and(eq(p2pOrdersTable.offerId, id), inArray(p2pOrdersTable.status, ["pending", "paid", "disputed"])))
        .limit(1);
      if (openOrder) throw bad("Cannot delete — offer has active orders. Set offline instead.");
      // For SELL ads: unlock remaining availableQty back to balance.
      const avail = Number(existing.availableQty);
      if (existing.side === "sell" && avail > 0) {
        const avStr = avail.toFixed(8);
        const [wPre] = await tx.select({ balance: walletsTable.balance })
          .from(walletsTable)
          .where(and(eq(walletsTable.userId, req.user!.id), eq(walletsTable.coinId, existing.coinId), eq(walletsTable.walletType, "spot")))
          .limit(1);
        const balBefore = wPre?.balance ?? "0";
        const balAfter  = String((Number(balBefore) + avail).toFixed(8));
        await unlockAdFunds(tx, req.user!.id, existing.coinId, avStr);
        await tx.insert(walletLedgerTable).values({
          userId: req.user!.id, coinId: existing.coinId, walletType: "spot", type: "p2p_credit",
          amount: avStr,
          balanceBefore: balBefore, balanceAfter: balAfter,
          refType: "p2p_offer", refId: String(id), note: "P2P sell ad deleted — remaining qty unlocked",
        });
      }
      const [updated] = await tx.update(p2pOffersTable)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(p2pOffersTable.id, id)).returning();
      return updated;
    });
    req.log.info({ offerId: id, userId: req.user!.id }, "p2p offer deleted by owner");
    res.json({ ok: true, offer: result });
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, offerId: id }, "p2p offer delete failed");
    throw e;
  }
});

// Orders (Deals) — escrow-backed P2P trades

const OpenOrderBody = z.object({
  offerId: z.coerce.number().int().positive(),
  // Counterparty specifies amount in EITHER fiat or crypto — we resolve
  // the other side from the offer's frozen price. Exactly one required.
  fiatAmount: z.coerce.number().finite().positive().optional(),
  qty: z.coerce.number().finite().positive().optional(),
  paymentMethodId: z.coerce.number().int().positive(),
}).strict().superRefine((d, ctx) => {
  if (d.fiatAmount == null && d.qty == null) ctx.addIssue({ code: "custom", path: ["fiatAmount"], message: "Provide fiatAmount or qty" });
  if (d.fiatAmount != null && d.qty != null) ctx.addIssue({ code: "custom", path: ["qty"], message: "Provide only ONE of fiatAmount/qty" });
});

router.post("/p2p/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = OpenOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const d = parsed.data;
  const me = req.user!;
  if (me.kycLevel < 1) { res.status(403).json({ error: "KYC Level 1 required for P2P trading" }); return; }

  try {
    const created = await db.transaction(async (tx) => {
      const [offer] = await tx.select().from(p2pOffersTable)
        .where(eq(p2pOffersTable.id, d.offerId))
        .for("update").limit(1);
      if (!offer) throw notFound("Offer not found");
      if (offer.status !== "online") throw bad(`Offer is ${offer.status}`);
      if (offer.userId === me.id) throw bad("Cannot trade your own offer");
      if (me.kycLevel < offer.minKycLevel) throw forbidden(`KYC Level ${offer.minKycLevel} required by this merchant`);

      // Resolve qty + fiat amount, snapshot price.
      const price = Number(offer.price);
      const qty = d.qty != null ? Number(d.qty) : (d.fiatAmount! / price);
      const fiatAmount = d.fiatAmount != null ? Number(d.fiatAmount) : (qty * price);
      const minF = Number(offer.minFiat), maxF = Number(offer.maxFiat);
      if (fiatAmount < minF) throw bad(`Below min order amount (₹${minF})`);
      if (fiatAmount > maxF) throw bad(`Above max order amount (₹${maxF})`);
      if (qty > Number(offer.availableQty)) throw bad("Not enough liquidity remaining");

      // Resolve buyer / seller from offer side. Offer side is the
      // MERCHANT's intent; the order opener is the counterparty.
      // - offer.side = "sell" → merchant sells, opener BUYS
      // - offer.side = "buy"  → merchant buys, opener SELLS
      const buyerId = offer.side === "sell" ? me.id : offer.userId;
      const sellerId = offer.side === "sell" ? offer.userId : me.id;

      // The buyer pays fiat TO the seller, so paymentMethodId must
      // reference an active method owned by the SELLER. The way we get
      // there depends on which side opened the order:
      //   • SELL offer (merchant sells crypto): the seller IS the merchant
      //     and saved methods at offer-creation time. The buyer (opener)
      //     picks one via /p2p/offers/{id}/seller-methods.
      //   • BUY offer (merchant buys crypto): the seller IS the opener
      //     and posts ONE OF THEIR OWN saved method ids so the merchant
      //     knows where to send the fiat.
      const [pm] = await tx.select().from(p2pPaymentMethodsTable)
        .where(and(eq(p2pPaymentMethodsTable.id, d.paymentMethodId), eq(p2pPaymentMethodsTable.userId, sellerId), eq(p2pPaymentMethodsTable.active, true)))
        .limit(1);
      if (!pm) throw notFound("Payment method not found or not owned by the seller");
      const acceptedMethods = String(offer.paymentMethods || "").split(",").filter(Boolean);
      if (!acceptedMethods.includes(pm.method)) throw bad(`This offer doesn't accept ${pm.method}`);

      const qtyStr = quantizeQty(qty);
      const fiatStr = fiatAmount.toFixed(2);

      // ─── Escrow logic ─────────────────────────────────────────────────────
      // SELL offer: funds were locked into p2pLocked when the ad was posted,
      //   so no wallet move is needed here — just decrement availableQty.
      // BUY offer:  the counterparty (opener) is the seller; they have NOT
      //   pre-locked anything, so we call lockEscrow to move their balance
      //   → p2pLocked now, as in the original per-order escrow model.
      if (offer.side === "buy") {
        await lockEscrow(tx, sellerId, offer.coinId, qtyStr);
        const [sellerWPre] = await tx.select({ balance: walletsTable.balance })
          .from(walletsTable)
          .where(and(eq(walletsTable.userId, sellerId), eq(walletsTable.coinId, offer.coinId), eq(walletsTable.walletType, "spot")))
          .limit(1);
        const sellerBalBefore = sellerWPre?.balance ?? "0";
        const sellerBalAfterLock = String((parseFloat(sellerBalBefore) - Number(qtyStr)).toFixed(8));
        // Write ledger AFTER lockEscrow so balance reflects the new state.
        const [tempOrder] = await tx.insert(p2pOrdersTable).values({
          offerId: offer.id, buyerId, sellerId, coinId: offer.coinId,
          fiat: offer.fiat, price: String(price), qty: qtyStr, fiatAmount: fiatStr,
          paymentMethod: pm.method, paymentAccount: pm.account, paymentLabel: pm.label,
          paymentIfsc: pm.ifsc, paymentHolderName: pm.holderName, status: "pending",
          expiresAt: new Date(Date.now() + offer.payWindowMins * 60 * 1000),
        }).returning();
        await tx.update(p2pOffersTable).set({
          availableQty: sql`${p2pOffersTable.availableQty} - ${qtyStr}::numeric`,
          updatedAt: new Date(),
        }).where(eq(p2pOffersTable.id, offer.id));
        await tx.insert(walletLedgerTable).values({
          userId: sellerId, coinId: offer.coinId, walletType: "spot", type: "p2p_debit",
          amount: (-Number(qtyStr)).toFixed(8),
          balanceBefore: sellerBalBefore, balanceAfter: sellerBalAfterLock,
          refType: "p2p_order", refId: String(tempOrder.id), note: "P2P escrow lock (buy offer)",
        });
        await tx.insert(p2pMessagesTable).values({
          orderId: tempOrder.id, senderId: me.id, senderRole: "system",
          body: `Order opened — buyer must pay ₹${fiatStr} within ${offer.payWindowMins} minutes.`,
        });
        return tempOrder;
      }

      // SELL offer path: funds already in p2pLocked; just decrement availableQty.
      // Decrement available liquidity on the offer.
      await tx.update(p2pOffersTable).set({
        availableQty: sql`${p2pOffersTable.availableQty} - ${qtyStr}::numeric`,
        updatedAt: new Date(),
      }).where(eq(p2pOffersTable.id, offer.id));

      const expiresAt = new Date(Date.now() + offer.payWindowMins * 60 * 1000);
      const [order] = await tx.insert(p2pOrdersTable).values({
        offerId: offer.id,
        buyerId, sellerId,
        coinId: offer.coinId,
        fiat: offer.fiat,
        price: String(price),
        qty: qtyStr,
        fiatAmount: fiatStr,
        paymentMethod: pm.method,
        paymentAccount: pm.account,
        paymentLabel: pm.label,
        paymentIfsc: pm.ifsc,
        paymentHolderName: pm.holderName,
        status: "pending",
        expiresAt,
      }).returning();
      // No wallet ledger entry at order-open for sell offers — the ad-creation
      // ledger entry already recorded the full lock. Order release/cancel will
      // write the final credit entries.

      // Seed a system message so the chat shows the deal opening as
      // its first event (great for audit + onboarding context).
      await tx.insert(p2pMessagesTable).values({
        orderId: order.id,
        senderId: me.id,
        senderRole: "system",
        body: `Order opened — buyer must pay ₹${fiatStr} within ${offer.payWindowMins} minutes.`,
      });
      return order;
    });
    req.log.info({ orderId: created.id, offerId: d.offerId, buyerId: created.buyerId, sellerId: created.sellerId, qty: created.qty, fiatAmount: created.fiatAmount }, "p2p order opened");
    res.status(201).json(created);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message }, "p2p order create failed");
    throw e;
  }
});

router.get("/p2p/orders", requireAuth, async (req, res): Promise<void> => {
  const role = String(req.query.role || "all"); // buyer | seller | all
  const status = String(req.query.status || "all");
  const me = req.user!.id;

  const conds: SQL[] = [];
  if (role === "buyer") conds.push(eq(p2pOrdersTable.buyerId, me));
  else if (role === "seller") conds.push(eq(p2pOrdersTable.sellerId, me));
  else {
    const either = or(eq(p2pOrdersTable.buyerId, me), eq(p2pOrdersTable.sellerId, me));
    if (either) conds.push(either);
  }
  if (status !== "all" && (ORDER_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(p2pOrdersTable.status, status));
  }

  const rows = await db.select().from(p2pOrdersTable).where(and(...conds))
    .orderBy(desc(p2pOrdersTable.createdAt)).limit(200);
  req.log.debug({ userId: me, role, status, count: rows.length }, "p2p orders listed");
  res.json(await hydrateOrders(rows, me));
});

router.get("/p2p/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const me = req.user!.id;
  const [order] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).limit(1);
  if (!order || (order.buyerId !== me && order.sellerId !== me && req.user!.role === "user")) {
    res.status(404).json({ error: "Order not found" }); return;
  }
  req.log.debug({ userId: me, orderId: id, status: order.status }, "p2p order fetched");
  const [hydrated] = await hydrateOrders([order], me);
  res.json(hydrated);
});

async function hydrateOrders(rows: OrderRow[], myId: number) {
  if (!rows.length) return [];
  const userIds = Array.from(new Set(rows.flatMap(r => [r.buyerId, r.sellerId])));
  const coinIds = Array.from(new Set(rows.map(r => r.coinId)));
  const [users, coins] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, kycLevel: usersTable.kycLevel, vipTier: usersTable.vipTier, createdAt: usersTable.createdAt }).from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(coinsTable).where(inArray(coinsTable.id, coinIds)),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  const coinById = new Map(coins.map(c => [c.id, c]));
  return rows.map(r => ({
    ...r,
    price: Number(r.price),
    qty: Number(r.qty),
    fiatAmount: Number(r.fiatAmount),
    role: r.buyerId === myId ? "buyer" : (r.sellerId === myId ? "seller" : "admin"),
    coin: coinById.get(r.coinId) ? { id: r.coinId, symbol: coinById.get(r.coinId)!.symbol, name: coinById.get(r.coinId)!.name } : null,
    buyer: publicMerchantView(userById.get(r.buyerId)),
    seller: publicMerchantView(userById.get(r.sellerId)),
  }));
}

// Buyer: I have sent fiat — flip status to "paid"
router.post("/p2p/orders/:id/mark-paid", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const utr = (req.body?.utr ? String(req.body.utr).slice(0, 60) : null);

  try {
    const result = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).for("update").limit(1);
      if (!o) throw notFound("Order not found");
      if (o.buyerId !== req.user!.id) throw forbidden("Only the buyer can mark paid");
      if (o.status !== "pending") throw bad(`Cannot mark paid — order is ${o.status}`);
      // Window check — if the window has elapsed we don't accept the
      // paid claim; the buyer must talk to the seller via dispute.
      if (o.expiresAt && o.expiresAt.getTime() < Date.now()) {
        throw bad("Pay window expired — open a dispute if you've already paid");
      }
      const [updated] = await tx.update(p2pOrdersTable).set({
        status: "paid",
        paidAt: new Date(),
        paymentUtr: utr,
        updatedAt: new Date(),
      }).where(eq(p2pOrdersTable.id, id)).returning();
      await tx.insert(p2pMessagesTable).values({
        orderId: id, senderId: req.user!.id, senderRole: "system",
        body: utr ? `Buyer marked as paid (UTR: ${utr}). Seller please verify and release.`
                  : `Buyer marked as paid. Seller please verify and release.`,
      });
      return updated;
    });
    req.log.info({ orderId: id, buyerId: req.user!.id, hasUtr: !!utr }, "p2p order marked paid");
    res.json(result);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, orderId: id }, "p2p mark-paid failed");
    throw e;
  }
});

// Seller (or admin): I confirm receipt — release escrow to buyer.
router.post("/p2p/orders/:id/release", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await releaseOrder(id, req.user!.id, req.user!.role);
    req.log.info({ orderId: id, actorId: req.user!.id, actorRole: req.user!.role }, "p2p order released");
    res.json(result);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, orderId: id }, "p2p release failed");
    throw e;
  }
});

/**
 * Move escrowed crypto from seller.locked → buyer.balance, mark order
 * "released". Callable by:
 *   - the seller (only if status === "paid")
 *   - admin/superadmin (any status, used by dispute resolution)
 */
async function releaseOrder(orderId: number, actorId: number, actorRole: string) {
  return await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).for("update").limit(1);
    if (!o) throw notFound("Order not found");
    const isAdmin = actorRole === "admin" || actorRole === "superadmin";
    if (!isAdmin && o.sellerId !== actorId) throw forbidden("Only the seller or admin can release");
    if (o.status === "released") throw bad("Already released");
    if (!isAdmin && o.status !== "paid") throw bad("Buyer hasn't marked as paid yet");
    if (o.status === "cancelled" || o.status === "expired") throw bad("Cannot release a cancelled/expired order");

    // Snapshot wallets before the escrow move for accurate ledger audit trail.
    const [relSellerWPre] = await tx.select({ p2pLocked: walletsTable.p2pLocked })
      .from(walletsTable)
      .where(and(eq(walletsTable.userId, o.sellerId), eq(walletsTable.coinId, o.coinId), eq(walletsTable.walletType, "spot")))
      .limit(1);
    const [relBuyerWPre] = await tx.select({ balance: walletsTable.balance })
      .from(walletsTable)
      .where(and(eq(walletsTable.userId, o.buyerId), eq(walletsTable.coinId, o.coinId), eq(walletsTable.walletType, "spot")))
      .limit(1);
    const relSellerLockedBefore = relSellerWPre?.p2pLocked ?? "0";
    const relSellerLockedAfter  = String((parseFloat(relSellerLockedBefore) - Number(o.qty)).toFixed(8));
    const relBuyerBalBefore     = relBuyerWPre?.balance ?? "0";
    const relBuyerBalAfter      = String((parseFloat(relBuyerBalBefore) + Number(o.qty)).toFixed(8));

    // Move crypto via shared helper: seller.p2pLocked → buyer.balance.
    await releaseEscrow(tx, o.sellerId, o.buyerId, o.coinId, o.qty);
    await tx.insert(walletLedgerTable).values([
      {
        userId: o.sellerId, coinId: o.coinId, walletType: "spot", type: "p2p_debit",
        amount: (-Number(o.qty)).toFixed(8),
        balanceBefore: relSellerLockedBefore, balanceAfter: relSellerLockedAfter,
        refType: "p2p_order", refId: String(orderId), note: "P2P escrow released to buyer (seller)",
      },
      {
        userId: o.buyerId, coinId: o.coinId, walletType: "spot", type: "p2p_credit",
        amount: Number(o.qty).toFixed(8),
        balanceBefore: relBuyerBalBefore, balanceAfter: relBuyerBalAfter,
        refType: "p2p_order", refId: String(orderId), note: "P2P crypto received (buyer)",
      },
    ]);

    const [updated] = await tx.update(p2pOrdersTable).set({
      status: "released",
      releasedAt: new Date(),
      ...(isAdmin ? { disputeResolution: "release", disputeResolvedBy: actorId, disputeResolvedAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(p2pOrdersTable.id, orderId)).returning();

    await tx.insert(p2pMessagesTable).values({
      orderId, senderId: actorId, senderRole: isAdmin ? "admin" : "system",
      body: isAdmin ? "Admin released funds to buyer." : "Seller released funds — order completed.",
    });
    return updated;
  });
}

// Cancel: refund escrow back to seller. Allowed when status=pending
// (either side can cancel). Once buyer has marked paid, only admin can
// cancel — buyer/seller must use dispute.
router.post("/p2p/orders/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const result = await cancelOrder(id, req.user!.id, req.user!.role);
    req.log.info({ orderId: id, actorId: req.user!.id, actorRole: req.user!.role }, "p2p order cancelled");
    res.json(result);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, orderId: id }, "p2p cancel failed");
    throw e;
  }
});

async function cancelOrder(orderId: number, actorId: number, actorRole: string) {
  return await db.transaction(async (tx) => {
    const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, orderId)).for("update").limit(1);
    if (!o) throw notFound("Order not found");
    const isAdmin = actorRole === "admin" || actorRole === "superadmin";
    const isParty = o.buyerId === actorId || o.sellerId === actorId;
    if (!isAdmin && !isParty) throw forbidden("Forbidden");
    if (o.status === "cancelled" || o.status === "released" || o.status === "expired") {
      throw bad(`Cannot cancel — order is ${o.status}`);
    }
    // Non-admins can ONLY cancel a still-pending order. Once buyer marks
    // paid OR a dispute has been opened, only admin moderation can resolve
    // it — otherwise a malicious seller could escape via paid→disputed→cancel
    // and refund themselves AFTER the buyer has paid fiat.
    if (o.status !== "pending" && !isAdmin) {
      throw bad(o.status === "paid"
        ? "Buyer already marked as paid — open a dispute instead"
        : "Order is under dispute — only an admin can cancel");
    }

    const qtyStr = quantizeQty(o.qty);

    // Fetch the offer to determine side (SELL vs BUY escrow model).
    const [offer] = await tx.select({ side: p2pOffersTable.side })
      .from(p2pOffersTable).where(eq(p2pOffersTable.id, o.offerId)).limit(1);
    const isSellOffer = offer?.side === "sell";

    if (isSellOffer) {
      // SELL offer: seller's funds are already in p2pLocked from the ad-level lock.
      // Do NOT call refundEscrow — funds stay locked for the ad, just restore
      // availableQty so the slot is available for new orders.
      await tx.update(p2pOffersTable).set({
        availableQty: sql`${p2pOffersTable.availableQty} + ${qtyStr}::numeric`,
        updatedAt: new Date(),
      }).where(eq(p2pOffersTable.id, o.offerId));
    } else {
      // BUY offer: counterparty seller locked at order-open time — refund them.
      const [cancelSellerWPre] = await tx.select({ balance: walletsTable.balance })
        .from(walletsTable)
        .where(and(eq(walletsTable.userId, o.sellerId), eq(walletsTable.coinId, o.coinId), eq(walletsTable.walletType, "spot")))
        .limit(1);
      const cancelSellerBalBefore = cancelSellerWPre?.balance ?? "0";
      const cancelSellerBalAfter  = String((parseFloat(cancelSellerBalBefore) + Number(qtyStr)).toFixed(8));
      await refundEscrow(tx, o.sellerId, o.coinId, qtyStr);
      await tx.insert(walletLedgerTable).values({
        userId: o.sellerId, coinId: o.coinId, walletType: "spot", type: "p2p_credit",
        amount: Number(qtyStr).toFixed(8),
        balanceBefore: cancelSellerBalBefore, balanceAfter: cancelSellerBalAfter,
        refType: "p2p_order", refId: String(o.id), note: "P2P escrow refunded (buy-offer order cancelled)",
      });
      // Restore offer's available liquidity.
      await tx.update(p2pOffersTable).set({
        availableQty: sql`${p2pOffersTable.availableQty} + ${qtyStr}::numeric`,
        updatedAt: new Date(),
      }).where(eq(p2pOffersTable.id, o.offerId));
    }

    const [updated] = await tx.update(p2pOrdersTable).set({
      status: "cancelled",
      cancelledAt: new Date(),
      ...(isAdmin && o.status === "disputed" ? {
        disputeResolution: "refund",
        disputeResolvedBy: actorId,
        disputeResolvedAt: new Date(),
      } : {}),
      updatedAt: new Date(),
    }).where(eq(p2pOrdersTable.id, orderId)).returning();

    await tx.insert(p2pMessagesTable).values({
      orderId, senderId: actorId, senderRole: isAdmin ? "admin" : "system",
      body: isSellOffer
        ? (isAdmin ? "Admin cancelled order — qty returned to ad reserve." : "Order cancelled — qty returned to ad reserve.")
        : (isAdmin ? "Admin cancelled and refunded escrow to seller." : "Order cancelled — escrow refunded to seller."),
    });
    return updated;
  });
}

// Open a dispute. evidenceUrl is an untrusted external link rendered
// for moderators in the admin UI; we don't host uploads.
// Restrict evidenceUrl to http(s) schemes only — z.string().url() also accepts
// `javascript:` / `data:` / `file:` which would be rendered as a clickable link
// in the admin dashboard. We parse and require the protocol explicitly.
const httpUrl = z.string().trim().max(500).refine(
  (s) => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Evidence URL must be a valid http(s) URL" },
);

const DisputeBody = z.object({
  reason: z.string().trim().min(10, "Please describe the issue (min 10 chars)").max(500),
  evidenceUrl: httpUrl.optional(),
}).strict();

router.post("/p2p/orders/:id/dispute", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = DisputeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { reason, evidenceUrl } = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).for("update").limit(1);
      if (!o) throw notFound("Order not found");
      const isParty = o.buyerId === req.user!.id || o.sellerId === req.user!.id;
      if (!isParty) throw forbidden("Forbidden");
      if (o.status !== "pending" && o.status !== "paid") {
        throw bad(`Cannot dispute — order is ${o.status}`);
      }
      const [updated] = await tx.update(p2pOrdersTable).set({
        status: "disputed",
        disputeOpenedBy: req.user!.id,
        disputeReason: reason,
        disputeOpenedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(p2pOrdersTable.id, id)).returning();
      // Mirror into the dedicated p2p_disputes table (one row per order).
      // ON CONFLICT covers the rare case of a re-opened dispute on the
      // same order — we simply refresh the existing row.
      await tx.insert(p2pDisputesTable).values({
        orderId: id,
        openedBy: req.user!.id,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        reason,
        evidenceUrl: evidenceUrl ?? null,
        status: "open",
      }).onConflictDoUpdate({
        target: p2pDisputesTable.orderId,
        set: {
          status: "open",
          reason,
          openedBy: req.user!.id,
          openedAt: new Date(),
          evidenceUrl: evidenceUrl ?? null,
          updatedAt: new Date(),
        },
      });
      await tx.insert(p2pMessagesTable).values({
        orderId: id, senderId: req.user!.id, senderRole: "system",
        body: evidenceUrl
          ? `Dispute opened: ${reason.slice(0, 200)} (evidence attached)`
          : `Dispute opened: ${reason.slice(0, 200)}`,
      });
      return updated;
    });
    req.log.warn({ orderId: id, openedBy: req.user!.id, reasonLen: reason.length, hasEvidence: !!evidenceUrl }, "p2p dispute opened");
    res.json(result);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, orderId: id }, "p2p dispute open failed");
    throw e;
  }
});

// Chat

router.get("/p2p/orders/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const me = req.user!.id;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "superadmin" || req.user!.role === "support";
  const [o] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).limit(1);
  if (!o || (!isAdmin && o.buyerId !== me && o.sellerId !== me)) {
    res.status(404).json({ error: "Order not found" }); return;
  }
  const rows = await db.select().from(p2pMessagesTable)
    .where(eq(p2pMessagesTable.orderId, id))
    .orderBy(asc(p2pMessagesTable.createdAt))
    .limit(500);
  req.log.debug({ userId: me, orderId: id, count: rows.length }, "p2p chat fetched");
  res.json(rows);
});

router.post("/p2p/orders/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = String(req.body?.body || "").trim();
  if (body.length < 1) { res.status(400).json({ error: "Message body required" }); return; }
  if (body.length > 1000) { res.status(400).json({ error: "Message too long (max 1000 chars)" }); return; }

  const me = req.user!.id;
  const isAdmin = req.user!.role === "admin" || req.user!.role === "superadmin" || req.user!.role === "support";
  const [o] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).limit(1);
  if (!o) { res.status(404).json({ error: "Order not found" }); return; }
  if (!isAdmin && o.buyerId !== me && o.sellerId !== me) { res.status(403).json({ error: "Forbidden" }); return; }

  const role = isAdmin && o.buyerId !== me && o.sellerId !== me
    ? "admin"
    : (o.buyerId === me ? "buyer" : "seller");
  const [created] = await db.insert(p2pMessagesTable).values({
    orderId: id, senderId: me, senderRole: role, body,
  }).returning();
  req.log.info({ orderId: id, senderId: me, senderRole: role, len: body.length }, "p2p chat message");
  res.status(201).json(created);
});

// ─── Rate counterparty ───────────────────────────────────────────────────
// One rating per order per participant. Available once order reaches
// "released" or "cancelled". Score 1–5, optional comment ≤300 chars.
const RateBody = z.object({
  score: z.number().int().min(1, "Score 1–5 required").max(5, "Score 1–5 required"),
  comment: z.string().trim().max(300).optional(),
}).strict();

router.post("/p2p/orders/:id/rate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = RateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { score, comment } = parsed.data;
  const me = req.user!.id;
  try {
    const [o] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).limit(1);
    if (!o) { res.status(404).json({ error: "Order not found" }); return; }
    if (o.buyerId !== me && o.sellerId !== me) { res.status(403).json({ error: "Forbidden" }); return; }
    if (o.status !== "released" && o.status !== "cancelled") {
      res.status(400).json({ error: "Can only rate completed or cancelled orders" }); return;
    }
    const ratedId = o.buyerId === me ? o.sellerId : o.buyerId;
    const [existing] = await db.select({ id: p2pRatingsTable.id })
      .from(p2pRatingsTable)
      .where(and(eq(p2pRatingsTable.orderId, id), eq(p2pRatingsTable.raterId, me)))
      .limit(1);
    if (existing) { res.status(400).json({ error: "Already rated this order" }); return; }
    const [rating] = await db.insert(p2pRatingsTable).values({
      orderId: id, raterId: me, ratedId, score, comment: comment || null,
    }).returning();
    req.log.info({ orderId: id, raterId: me, ratedId, score }, "p2p rating submitted");
    res.status(201).json(rating);
  } catch (e) {
    if (sendError(res, e)) return;
    throw e;
  }
});

// ─── Merchant public stats ────────────────────────────────────────────────
// Aggregated per-user trade stats for the merchant profile card.
// Returns: totalTrades (released), completionRate %, avgReleaseTimeSecs,
// avgRating (null if no ratings yet), ratingCount.
router.get("/p2p/merchant/:userId/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const [stats] = await db.select({
    total: sql<number>`count(*)::int`,
    released: sql<number>`count(*) filter (where status = 'released')::int`,
    cancelled: sql<number>`count(*) filter (where (status = 'cancelled' or status = 'expired'))::int`,
    avgReleaseSecs: sql<number | null>`extract(epoch from avg(released_at - paid_at)) filter (where released_at is not null and paid_at is not null)`,
  }).from(p2pOrdersTable)
    .where(or(eq(p2pOrdersTable.buyerId, userId), eq(p2pOrdersTable.sellerId, userId)));
  const [ratingStats] = await db.select({
    avgRating: sql<number | null>`round(avg(score)::numeric, 1)`,
    ratingCount: sql<number>`count(*)::int`,
  }).from(p2pRatingsTable).where(eq(p2pRatingsTable.ratedId, userId));
  const total = stats?.total ?? 0;
  const released = stats?.released ?? 0;
  const completionRate = total > 0 ? Math.round((released / total) * 100) : 100;
  res.json({
    userId,
    totalTrades: released,
    completionRate,
    avgReleaseTimeSecs: stats?.avgReleaseSecs ? Math.round(Number(stats.avgReleaseSecs)) : null,
    avgRating: ratingStats?.avgRating ? Number(ratingStats.avgRating) : null,
    ratingCount: ratingStats?.ratingCount ?? 0,
  });
});

// Admin / moderation

router.get("/admin/p2p/stats", supportPlus, async (req, res): Promise<void> => {
  const [open] = await db.select({ c: sql<number>`count(*)::int` }).from(p2pOffersTable).where(eq(p2pOffersTable.status, "online"));
  const [orders] = await db.select({ c: sql<number>`count(*)::int` }).from(p2pOrdersTable).where(inArray(p2pOrdersTable.status, ["pending", "paid"]));
  const [disputes] = await db.select({ c: sql<number>`count(*)::int` }).from(p2pOrdersTable).where(eq(p2pOrdersTable.status, "disputed"));
  const [released] = await db.select({ c: sql<number>`count(*)::int` }).from(p2pOrdersTable).where(eq(p2pOrdersTable.status, "released"));
  const payload = {
    onlineOffers: open?.c ?? 0,
    activeOrders: orders?.c ?? 0,
    openDisputes: disputes?.c ?? 0,
    completedOrders: released?.c ?? 0,
  };
  req.log.debug({ adminId: req.user!.id, ...payload }, "p2p admin stats");
  res.json(payload);
});

router.get("/admin/p2p/offers", supportPlus, async (req, res): Promise<void> => {
  const status = String(req.query.status || "all");
  const conds: SQL[] = [];
  if (status !== "all") conds.push(eq(p2pOffersTable.status, status));
  const rows = await db.select().from(p2pOffersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(p2pOffersTable.createdAt))
    .limit(200);
  req.log.debug({ adminId: req.user!.id, status, count: rows.length }, "p2p admin offers listed");
  res.json(await hydrateOffers(rows));
});

router.patch("/admin/p2p/offers/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const status = String(req.body?.status || "");
  if (!["online", "offline", "suspended", "closed"].includes(status)) {
    res.status(400).json({ error: "status must be online/offline/suspended/closed" }); return;
  }
  const [updated] = await db.update(p2pOffersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(p2pOffersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Offer not found" }); return; }
  req.log.info({ adminId: req.user!.id, offerId: id, newStatus: status }, "admin updated p2p offer status");
  await logAdminAction(req, { action: "p2p.offer.status_change", entity: "p2p_offer", entityId: id, payload: { newStatus: status } });
  const [hydrated] = await hydrateOffers([updated]);
  res.json(hydrated);
});

router.get("/admin/p2p/orders", supportPlus, async (req, res): Promise<void> => {
  const status = String(req.query.status || "all");
  const conds: SQL[] = [];
  if (status !== "all" && (ORDER_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(p2pOrdersTable.status, status));
  }
  const rows = await db.select().from(p2pOrdersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(p2pOrdersTable.createdAt))
    .limit(200);
  req.log.debug({ adminId: req.user!.id, status, count: rows.length }, "p2p admin orders listed");
  res.json(await hydrateOrders(rows, -1));
});

router.get("/admin/p2p/disputes", supportPlus, async (req, res): Promise<void> => {
  // Left-join p2p_disputes so the admin moderation panel can render the
  // evidence_url attached at dispute-open time. Falls back gracefully to
  // null for legacy disputes that pre-date migration 008.
  const rows = await db.select({
    order: p2pOrdersTable,
    evidenceUrl: p2pDisputesTable.evidenceUrl,
  }).from(p2pOrdersTable)
    .leftJoin(p2pDisputesTable, eq(p2pDisputesTable.orderId, p2pOrdersTable.id))
    .where(eq(p2pOrdersTable.status, "disputed"))
    .orderBy(asc(p2pOrdersTable.disputeOpenedAt))
    .limit(200);
  const evidenceByOrder = new Map(rows.map(r => [r.order.id, r.evidenceUrl ?? null]));
  req.log.debug({ adminId: req.user!.id, count: rows.length }, "p2p admin disputes listed");
  const hydrated = await hydrateOrders(rows.map(r => r.order), -1);
  res.json(hydrated.map(o => ({ ...o, disputeEvidenceUrl: evidenceByOrder.get(o.id) ?? null })));
});

const ResolveDisputeBody = z.object({
  action: z.enum(["release", "refund"]),
  notes: z.string().trim().min(10, "Resolution notes must be at least 10 characters").max(500),
});

router.post("/admin/p2p/disputes/:id/resolve", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = ResolveDisputeBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first.message, field: first.path.join(".") });
    return;
  }
  const { action, notes } = parsed.data;

  try {
    const [o] = await db.select().from(p2pOrdersTable).where(eq(p2pOrdersTable.id, id)).limit(1);
    if (!o) { res.status(404).json({ error: "Order not found" }); return; }
    if (o.status !== "disputed") { res.status(400).json({ error: "Order is not in dispute state" }); return; }

    const result = action === "release"
      ? await releaseOrder(id, req.user!.id, req.user!.role)
      : await cancelOrder(id, req.user!.id, req.user!.role);

    await db.update(p2pOrdersTable)
      .set({ disputeNotes: notes, updatedAt: new Date() })
      .where(eq(p2pOrdersTable.id, id));
    await db.insert(p2pMessagesTable).values({
      orderId: id, senderId: req.user!.id, senderRole: "admin",
      body: `Admin notes: ${notes.slice(0, 300)}`,
    });
    // Close the dispute row; legacy orders disputed pre-migration-008 may not have one.
    const [existingDispute] = await db.select({ id: p2pDisputesTable.id })
      .from(p2pDisputesTable).where(eq(p2pDisputesTable.orderId, id)).limit(1);
    if (existingDispute) {
      await db.update(p2pDisputesTable).set({
        status: "resolved",
        resolution: action,
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
        notes,
        updatedAt: new Date(),
      }).where(eq(p2pDisputesTable.id, existingDispute.id));
    } else {
      await db.insert(p2pDisputesTable).values({
        orderId: id,
        openedBy: o.disputeOpenedBy ?? o.buyerId,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        reason: o.disputeReason ?? "(legacy)",
        status: "resolved",
        resolution: action,
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
        notes,
      });
    }
    req.log.info({ adminId: req.user!.id, orderId: id, action }, "admin resolved p2p dispute");
    await logAdminAction(req, {
      action: action === "release" ? "p2p.dispute.resolve_release" : "p2p.dispute.resolve_refund",
      entity: "p2p_order",
      entityId: id,
      payload: { action, notes: notes.slice(0, 200) },
    });
    res.json(result);
  } catch (e) {
    if (sendError(res, e)) return;
    req.log.error({ err: (e as Error)?.message, orderId: id, action }, "admin dispute resolve failed");
    throw e;
  }
});

export default router;
