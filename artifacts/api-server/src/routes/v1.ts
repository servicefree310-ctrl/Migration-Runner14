import { Router, type Request, type Response, type IRouter } from "express";
import { eq, and, desc, or, sql } from "drizzle-orm";
import {
  db, walletsTable, coinsTable, ordersTable, tradesTable, pairsTable,
  futuresPositionsTable, futuresOrdersTable,
  walletAddressesTable, networksTable, transfersTable,
  aiTradingPlansTable, aiTradingSubscriptionsTable,
  autoInvestAccountsTable,
  referralsTable, usersTable,
} from "@workspace/db";
// Importing requireApiKey ALSO loads the `declare module "express-serve-static-core"`
// block in api-key-auth.ts that augments Request with `apiKey`. Without this side
// effect tsc has no idea req.apiKey exists.
import { requireApiKey } from "../middlewares/api-key-auth";
import { sanitizeUser } from "../lib/auth";
import { placeSpotOrder, cancelSpotOrderById } from "./orders";

const router: IRouter = Router();

// ─── Helper: check if perms include spot/futures trade (legacy "trade" alias) ──
function hasTradePerm(perms: string[], type: "spot" | "futures"): boolean {
  if (perms.includes("trade")) return true;
  return type === "spot" ? perms.includes("spot_trade") : perms.includes("futures_trade");
}

// ─── Public: server clock ──────────────────────────────────────────────────────
// Clients call this once at startup to learn the server clock so they can
// compute a valid X-ZBX-TIMESTAMP without depending on local clock accuracy.
router.get("/v1/system/time", (_req: Request, res: Response): void => {
  const now = Date.now();
  res.json({ serverTime: now, iso: new Date(now).toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════════════
// READ-PERMISSION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Account info
router.get("/v1/account/me", requireApiKey("read"), (req: Request, res: Response): void => {
  res.json({
    user: sanitizeUser(req.user!),
    apiKey: {
      id: req.apiKey!.id,
      name: req.apiKey!.name,
      keyId: req.apiKey!.keyId,
      permissions: req.apiKey!.perms,
    },
  });
});

// Wallet balances — one row per (coin, walletType) the user holds
router.get("/v1/account/balances", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select({
      coin:       coinsTable.symbol,
      walletType: walletsTable.walletType,
      balance:    walletsTable.balance,
      locked:     walletsTable.locked,
    })
    .from(walletsTable)
    .innerJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, req.user!.id));
  res.json({
    balances: rows.map((r) => ({
      coin: r.coin,
      walletType: r.walletType,
      free: r.balance,
      locked: r.locked,
    })),
  });
});

// Deposit address for a coin+network
// Query: ?coinId=<id>&networkId=<id>   OR   ?coinSymbol=BTC&network=BTC
router.get("/v1/account/deposit-address", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  let networkId = req.query.networkId ? Number(req.query.networkId) : null;
  let coinId    = req.query.coinId    ? Number(req.query.coinId)    : null;

  if (!networkId && req.query.network) {
    const [net] = await db.select().from(networksTable)
      .where(eq(networksTable.chain, String(req.query.network).toUpperCase())).limit(1);
    networkId = net?.id ?? null;
    coinId = coinId ?? net?.coinId ?? null;
  }
  if (!coinId && req.query.coinSymbol) {
    const [coin] = await db.select().from(coinsTable)
      .where(eq(coinsTable.symbol, String(req.query.coinSymbol).toUpperCase())).limit(1);
    coinId = coin?.id ?? null;
  }
  if (!coinId || !networkId) {
    res.status(400).json({ error: "Provide coinId+networkId or coinSymbol+network" }); return;
  }

  const [network] = await db.select().from(networksTable)
    .where(eq(networksTable.id, networkId)).limit(1);
  if (!network) { res.status(404).json({ error: "Network not found" }); return; }
  if (network.status !== "active") { res.status(400).json({ error: "Network not active" }); return; }

  const [addr] = await db.select().from(walletAddressesTable)
    .where(and(eq(walletAddressesTable.userId, userId), eq(walletAddressesTable.networkId, networkId)))
    .limit(1);

  if (addr) {
    res.json({ address: addr.address, memo: addr.memo, networkId, coinId, chain: network.chain, network: network.name, status: addr.status });
    return;
  }
  res.status(404).json({ error: "No deposit address generated yet. Visit the Wallet page to generate one.", hint: "GET /user/wallet" });
});

// Open and recent orders (spot)
router.get("/v1/account/orders", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const status = req.query.status ? String(req.query.status) : null;
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase().replace(/[/\-]/g, "") : null;
  const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  let q = db.select({
    id: ordersTable.id, symbol: pairsTable.symbol,
    side: ordersTable.side, type: ordersTable.type,
    qty: ordersTable.qty, filledQty: ordersTable.filledQty,
    price: ordersTable.price, avgPrice: ordersTable.avgPrice,
    status: ordersTable.status, createdAt: ordersTable.createdAt,
  })
  .from(ordersTable)
  .innerJoin(pairsTable, eq(pairsTable.id, ordersTable.pairId))
  .where(and(
    eq(ordersTable.userId, userId),
    eq(ordersTable.isBot, 0),
    ...(status ? [eq(ordersTable.status, status)] : []),
    ...(symbol ? [eq(pairsTable.symbol, symbol)] : []),
  ))
  .orderBy(desc(ordersTable.createdAt))
  .limit(limit)
  .offset(offset) as any;

  const rows = await q;
  res.json({ orders: rows, count: rows.length });
});

// Trade history (fills)
router.get("/v1/account/trades", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase().replace(/[/\-]/g, "") : null;
  const limit  = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db.select({
    id: tradesTable.id, symbol: pairsTable.symbol,
    side: tradesTable.side, qty: tradesTable.qty,
    price: tradesTable.price, fee: tradesTable.fee,
    isTaker: tradesTable.isTaker, createdAt: tradesTable.createdAt,
  })
  .from(tradesTable)
  .innerJoin(pairsTable, eq(pairsTable.id, tradesTable.pairId))
  .where(and(
    eq(tradesTable.userId, userId),
    ...(symbol ? [eq(pairsTable.symbol, symbol)] : []),
  ))
  .orderBy(desc(tradesTable.createdAt))
  .limit(limit)
  .offset(offset);

  res.json({ trades: rows, count: rows.length });
});

// Futures open positions
router.get("/v1/account/futures/positions", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(futuresPositionsTable)
    .where(and(eq(futuresPositionsTable.userId, req.user!.id), eq(futuresPositionsTable.status, "open")));
  res.json({ positions: rows, count: rows.length });
});

// Futures orders
router.get("/v1/account/futures/orders", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const status = req.query.status ? String(req.query.status) : null;
  const limit  = Math.min(Number(req.query.limit ?? 100), 500);

  const rows = await db.select().from(futuresOrdersTable)
    .where(and(
      eq(futuresOrdersTable.userId, userId),
      ...(status ? [eq(futuresOrdersTable.status, status)] : []),
    ))
    .orderBy(desc(futuresOrdersTable.createdAt))
    .limit(limit);
  res.json({ orders: rows, count: rows.length });
});

// Transfer history
router.get("/v1/account/transfers", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select({
    id: transfersTable.id, fromWallet: transfersTable.fromWallet,
    toWallet: transfersTable.toWallet, coin: coinsTable.symbol,
    amount: transfersTable.amount, status: transfersTable.status,
    createdAt: transfersTable.createdAt,
  })
  .from(transfersTable)
  .innerJoin(coinsTable, eq(coinsTable.id, transfersTable.coinId))
  .where(eq(transfersTable.userId, req.user!.id))
  .orderBy(desc(transfersTable.createdAt))
  .limit(100);
  res.json({ transfers: rows, count: rows.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPOT TRADE ENDPOINTS  (requires spot_trade OR legacy trade permission)
// ═══════════════════════════════════════════════════════════════════════════════

// Place spot order
router.post("/v1/account/order", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  if (!hasTradePerm(req.apiKey!.perms, "spot")) {
    res.status(403).json({ error: "missing_permission", hint: "This key needs the spot_trade permission." }); return;
  }
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to place orders." }); return;
  }
  const { pairId, side, type, price, qty, stopPrice } = req.body ?? {};
  if (!pairId || !side || !type || !qty) {
    res.status(400).json({ error: "pairId, side, type, and qty are required" }); return;
  }
  try {
    const vipTier = Math.max(0, Math.min(5, req.user!.vipTier ?? 0));
    const result = await placeSpotOrder({
      userId: req.user!.id, vipTier,
      pairId: Number(pairId),
      side: String(side) as "buy" | "sell",
      type: String(type) as "limit" | "market" | "ioc" | "fok" | "post_only" | "stop_limit" | "stop_market",
      qty: Number(qty),
      price: price !== undefined ? Number(price) : undefined,
      stopPrice: stopPrice !== undefined ? Number(stopPrice) : undefined,
    });
    res.status(201).json(result.matched > 0 ? { ...result.order, matched: result.matched } : result.order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// Cancel spot order
router.delete("/v1/account/order/:id", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  if (!hasTradePerm(req.apiKey!.perms, "spot")) {
    res.status(403).json({ error: "missing_permission", hint: "This key needs the spot_trade permission." }); return;
  }
  try {
    const order = await cancelSpotOrderById(req.user!.id, Number(req.params.id));
    res.json(order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FUTURES TRADE ENDPOINTS  (requires futures_trade OR legacy trade permission)
// ═══════════════════════════════════════════════════════════════════════════════

// Cancel futures order
router.delete("/v1/account/futures/order/:id", requireApiKey("read"), async (req: Request, res: Response): Promise<void> => {
  if (!hasTradePerm(req.apiKey!.perms, "futures")) {
    res.status(403).json({ error: "missing_permission", hint: "This key needs the futures_trade permission." }); return;
  }
  const id = Number(req.params.id);
  const [order] = await db.select().from(futuresOrdersTable)
    .where(and(eq(futuresOrdersTable.id, id), eq(futuresOrdersTable.userId, req.user!.id))).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (!["pending", "open"].includes(String(order.status))) {
    res.status(400).json({ error: `Cannot cancel — status is ${order.status}` }); return;
  }
  const [updated] = await db.update(futuresOrdersTable)
    .set({ status: "cancelled" })
    .where(eq(futuresOrdersTable.id, id))
    .returning();
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSFER ENDPOINTS  (requires transfer permission)
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_WALLETS = ["spot", "futures", "earn", "inr"] as const;

router.post("/v1/account/transfer", requireApiKey("transfer"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { fromWallet, toWallet, coinSymbol, amount } = req.body ?? {};

  if (!ALLOWED_WALLETS.includes(fromWallet) || !ALLOWED_WALLETS.includes(toWallet)) {
    res.status(400).json({ error: "fromWallet/toWallet must be: spot / futures / earn / inr" }); return;
  }
  if (fromWallet === toWallet) { res.status(400).json({ error: "from and to must differ" }); return; }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }
  if (!coinSymbol) { res.status(400).json({ error: "coinSymbol required" }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [coin] = await tx.select().from(coinsTable)
        .where(eq(coinsTable.symbol, String(coinSymbol).toUpperCase())).limit(1);
      if (!coin) throw Object.assign(new Error("Coin not found"), { code: 404 });
      if ((fromWallet === "inr" || toWallet === "inr") && coin.symbol !== "INR")
        throw Object.assign(new Error("INR wallet only holds INR"), { code: 400 });

      const [src] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, fromWallet)))
        .for("update").limit(1);
      if (!src) throw Object.assign(new Error(`No ${fromWallet} wallet for ${coin.symbol}`), { code: 400 });
      if (Number(src.balance) < amt)
        throw Object.assign(new Error(`Insufficient balance in ${fromWallet} (have ${Number(src.balance).toFixed(8)})`), { code: 400 });

      const [dstExist] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, toWallet)))
        .for("update").limit(1);
      let dstId: number;
      if (dstExist) dstId = dstExist.id;
      else {
        const [c] = await tx.insert(walletsTable)
          .values({ userId, coinId: coin.id, walletType: toWallet, balance: "0", locked: "0" }).returning();
        dstId = c.id;
      }

      await tx.update(walletsTable).set({ balance: sql`${walletsTable.balance} - ${amt}`, updatedAt: new Date() })
        .where(eq(walletsTable.id, src.id));
      await tx.update(walletsTable).set({ balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date() })
        .where(eq(walletsTable.id, dstId));

      const [trf] = await tx.insert(transfersTable)
        .values({ userId, fromWallet, toWallet, coinId: coin.id, amount: String(amt), status: "completed" })
        .returning();
      return trf;
    });
    res.status(201).json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI PLAN ENDPOINTS  (requires ai_plan permission)
// ═══════════════════════════════════════════════════════════════════════════════

// List AI plans
router.get("/v1/account/ai-plans", requireApiKey("ai_plan"), async (_req: Request, res: Response): Promise<void> => {
  const plans = await db.select().from(aiTradingPlansTable)
    .where(eq(aiTradingPlansTable.isActive, true))
    .orderBy(desc(aiTradingPlansTable.dailyReturnPercent));
  res.json({ plans, count: plans.length });
});

// My AI subscriptions
router.get("/v1/account/ai-subscriptions", requireApiKey("ai_plan"), async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select({
    id: aiTradingSubscriptionsTable.id,
    planId: aiTradingSubscriptionsTable.planId,
    planName: aiTradingPlansTable.name,
    status: aiTradingSubscriptionsTable.status,
    investedAmount: aiTradingSubscriptionsTable.investedAmount,
    expiresAt: aiTradingSubscriptionsTable.expiresAt,
    startedAt: aiTradingSubscriptionsTable.startedAt,
  })
  .from(aiTradingSubscriptionsTable)
  .innerJoin(aiTradingPlansTable, eq(aiTradingPlansTable.id, aiTradingSubscriptionsTable.planId))
  .where(eq(aiTradingSubscriptionsTable.userId, req.user!.id))
  .orderBy(desc(aiTradingSubscriptionsTable.startedAt));
  res.json({ subscriptions: rows, count: rows.length });
});

// Cancel (stop) an AI subscription
router.delete("/v1/account/ai-subscriptions/:id", requireApiKey("ai_plan"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [sub] = await db.select().from(aiTradingSubscriptionsTable)
    .where(and(eq(aiTradingSubscriptionsTable.id, id), eq(aiTradingSubscriptionsTable.userId, req.user!.id))).limit(1);
  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }
  if (sub.status !== "active") { res.status(400).json({ error: `Subscription is already ${sub.status}` }); return; }
  const [updated] = await db.update(aiTradingSubscriptionsTable)
    .set({ status: "cancelled" })
    .where(eq(aiTradingSubscriptionsTable.id, id))
    .returning();
  res.json({ subscription: updated });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-INVEST ENDPOINTS  (requires invest permission)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/v1/account/auto-invest", requireApiKey("invest"), async (req: Request, res: Response): Promise<void> => {
  const [acct] = await db.select().from(autoInvestAccountsTable)
    .where(eq(autoInvestAccountsTable.userId, req.user!.id)).limit(1);
  if (!acct) { res.json({ account: null, message: "No auto-invest account found. Visit the Invest page to create one." }); return; }
  res.json({ account: acct });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REFERRAL ENDPOINTS  (requires referral permission)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/v1/account/referral", requireApiKey("referral"), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const [me] = await db.select({ referralCode: usersTable.referralCode })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const allRows = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(desc(referralsTable.createdAt));
  const totalBonus = allRows.reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  const credited   = allRows.filter((r) => r.bonusCredited).reduce((s, r) => s + parseFloat(r.bonusAmount ?? "0"), 0);
  res.json({
    referralCode: me?.referralCode ?? null,
    referralLink: me?.referralCode ? `https://zebvix.com/signup?ref=${me.referralCode}` : null,
    totalReferrals: allRows.length,
    totalBonusEarned: totalBonus,
    creditedBonus: credited,
    pendingBonus: totalBonus - credited,
    referrals: allRows.map((r) => ({
      id: r.id, level: r.level, bonusAmount: r.bonusAmount,
      bonusCredited: r.bonusCredited, createdAt: r.createdAt,
    })),
  });
});

export default router;
