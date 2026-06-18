import { z } from "zod/v4";
import { Router, type IRouter } from "express";
import { sql, eq, desc, and, or } from "drizzle-orm";
import {
  db,
  usersTable,
  coinsTable,
  networksTable,
  pairsTable,
  gatewaysTable,
  inrDepositsTable,
  inrWithdrawalsTable,
  cryptoDepositsTable,
  cryptoWithdrawalsTable,
  kycRecordsTable,
  kycSettingsTable,
  DEFAULT_KYC_TEMPLATES,
  bankAccountsTable,
  walletsTable,
  earnProductsTable,
  earnPositionsTable,
  legalPagesTable,
  settingsTable,
  ordersTable,
  loginLogsTable,
  otpProvidersTable,
  chatThreadsTable,
  chatMessagesTable,
  marketBotsTable,
  tradesTable,
  transfersTable,
  futuresPositionsTable,
  futuresTradesTable,
  sessionsTable,
  emailConfigsTable,
  customApisTable,
  walletLedgerTable,
} from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { sanitizeUser } from "../lib/auth";
import { sendKycApprovedEmail, sendKycRejectedEmail, sendDepositEmail } from "../lib/email";
import { logAdminAction } from "../lib/audit";
import { adminCancelSpotOrderById } from "./orders";
import { encryptSecret, maskSecret, decryptSecret } from "../lib/crypto-vault";
import { testNode } from "../lib/node-test";
import { getSweeperStatus, manualScan, sweepAllNetworks, startDepositSweeper, stopDepositSweeper } from "../lib/deposit-sweeper";
import { sweepDepositToMaster, getAutoSweepStats } from "../lib/deposit-sweep-master";
import { broadcastWithdrawal, getHotWalletBalance, isEvmChain, BroadcastError } from "../lib/auto-broadcaster";
import { getAutoWithdrawSchedulerStatus } from "../lib/auto-withdraw-scheduler";
import { checkAndCreditRegistrationBonus } from "../lib/referral-signup-bonus";
import { walletAddressesTable } from "@workspace/db";
import { isVaultPasswordSet, setVaultPassword, verifyVaultPassword } from "../lib/admin-vault";
import { isMnemonicConfigured, getMnemonicForReveal } from "../lib/hd-wallet";
import { chatComplete, isOpenAIConfigured, OpenAIError } from "../lib/openai";
import { broadcastPush } from "../lib/push";

const router: IRouter = Router();
const adminOnly = requireRole("admin", "superadmin");
const supportPlus = requireRole("admin", "superadmin", "support", "finance", "compliance", "marketing");

// Dashboard stats
router.get("/admin/stats", supportPlus, async (_req, res): Promise<void> => {
  const [users] = await db.select({ c: sql<number>`count(*)::int` }).from(usersTable);
  const [coins] = await db.select({ c: sql<number>`count(*)::int` }).from(coinsTable);
  const [pairs] = await db.select({ c: sql<number>`count(*)::int` }).from(pairsTable);
  const [pendingKyc] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(kycRecordsTable)
    .where(eq(kycRecordsTable.status, "pending"));
  const [pendingDeposits] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(inrDepositsTable)
    .where(eq(inrDepositsTable.status, "pending"));
  const [pendingWithdrawals] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(inrWithdrawalsTable)
    .where(eq(inrWithdrawalsTable.status, "pending"));
  const [pendingBanks] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.status, "under_review"));
  const [openOrders] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.status, "open"));
  const [pendingCryptoDeposits] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(cryptoDepositsTable)
    .where(eq(cryptoDepositsTable.status, "pending"));
  const [pendingCryptoWithdrawals] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(cryptoWithdrawalsTable)
    .where(eq(cryptoWithdrawalsTable.status, "pending"));
  const [openFutures] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(futuresPositionsTable)
    .where(eq(futuresPositionsTable.status, "open"));
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [futVol] = await db
    .select({ v: sql<string>`coalesce(sum(${futuresTradesTable.price}::numeric * ${futuresTradesTable.qty}::numeric), 0)::text` })
    .from(futuresTradesTable)
    .where(sql`${futuresTradesTable.createdAt} >= ${since}`);

  res.json({
    users: users?.c ?? 0,
    coins: coins?.c ?? 0,
    pairs: pairs?.c ?? 0,
    pendingKyc: pendingKyc?.c ?? 0,
    pendingDeposits: pendingDeposits?.c ?? 0,
    pendingWithdrawals: pendingWithdrawals?.c ?? 0,
    pendingBanks: pendingBanks?.c ?? 0,
    openOrders: openOrders?.c ?? 0,
    pendingCryptoDeposits: pendingCryptoDeposits?.c ?? 0,
    pendingCryptoWithdrawals: pendingCryptoWithdrawals?.c ?? 0,
    openFuturesPositions: openFutures?.c ?? 0,
    futures24hVolume: Number(futVol?.v ?? 0),
  });
});

// ─── Admin: 7-day volume history (spot trades) ────────────────────────────────
router.get("/admin/stats/volume-history", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      coalesce(sum(price::numeric * qty::numeric), 0)::float8 AS spot_volume,
      count(*)::int AS trade_count
    FROM trades
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  // Ensure all 7 days are present (fill gaps with 0)
  const map = new Map<string, { spotVolume: number; tradeCount: number }>();
  for (const r of rows.rows as any[]) {
    map.set(String(r.day), { spotVolume: Number(r.spot_volume), tradeCount: Number(r.trade_count) });
  }
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    const v = map.get(key) ?? { spotVolume: 0, tradeCount: 0 };
    result.push({ date: key, label, spotVolume: v.spotVolume, tradeCount: v.tradeCount });
  }
  res.json(result);
});

// ─── Admin: 30-day user growth ────────────────────────────────────────────────
router.get("/admin/stats/user-growth", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      count(*)::int AS signups
    FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const map = new Map<string, number>();
  for (const r of rows.rows as any[]) map.set(String(r.day), Number(r.signups));
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    result.push({ date: key, label, signups: map.get(key) ?? 0 });
  }
  res.json(result);
});

// ─── Admin: recent platform-wide activity feed ────────────────────────────────
router.get("/admin/stats/activity", supportPlus, async (_req, res): Promise<void> => {
  const [recentTrades, recentOrders] = await Promise.all([
    db.execute(sql`
      SELECT
        t.id,
        coalesce(p.symbol, 'UNKNOWN') AS symbol,
        t.price::float8, t.qty::float8,
        t.side, t.created_at,
        u.email AS user_email
      FROM trades t
      LEFT JOIN pairs p ON p.id = t.pair_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY t.created_at DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT
        o.id, o.side, o.type,
        o.price::float8, o.qty::float8, o.status, o.created_at,
        p.symbol AS pair,
        u.email AS user_email
      FROM orders o
      LEFT JOIN pairs p ON p.id = o.pair_id
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 10
    `),
  ]);
  res.json({
    trades: recentTrades.rows,
    orders: recentOrders.rows,
  });
});

// ─── Admin: user security actions (reset 2FA / force logout) ─────────────────
router.post("/admin/users/:id/disable-2fa", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [u] = await db
    .update(usersTable)
    .set({ twoFaEnabled: false, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  void logAdminAction(req, { action: "user.disable_2fa", entity: "user", entityId: id });
  res.json({ ok: true, twoFaEnabled: false });
});

router.post("/admin/users/:id/force-logout", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const deleted = await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.userId, id))
    .returning({ id: sessionsTable.id });
  void logAdminAction(req, { action: "user.force_logout", entity: "user", entityId: id, payload: { revoked: deleted.length } });
  res.json({ ok: true, revoked: deleted.length });
});

// One-click freeze: status -> suspended + revoke all sessions atomically.
// Combines the historical PATCH /admin/users/:id { status:"suspended" }
// + force-logout into a single audit-logged action. Once frozen, the
// requireAuth middleware blocks any further API calls for that user.
router.post("/admin/users/:id/freeze", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const reason = String((req.body ?? {}).reason ?? "").slice(0, 500) || null;
  // Refuse to freeze yourself — would lock the operator out of their own session
  if (req.user?.id === id) { res.status(400).json({ error: "Cannot freeze your own account" }); return; }
  const [u] = await db
    .update(usersTable)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const deleted = await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.userId, id))
    .returning({ id: sessionsTable.id });
  void logAdminAction(req, {
    action: "user.freeze", entity: "user", entityId: id,
    payload: { reason, sessionsRevoked: deleted.length },
  });
  res.json({ ok: true, status: u.status, sessionsRevoked: deleted.length });
});

router.post("/admin/users/:id/unfreeze", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [u] = await db
    .update(usersTable)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  void logAdminAction(req, { action: "user.unfreeze", entity: "user", entityId: id });
  res.json({ ok: true, status: u.status });
});

// ─── Admin: force-cancel any order (incl. bot orders) ───────────────────
router.post("/admin/orders/:id/cancel", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const reason = String((req.body ?? {}).reason ?? "").slice(0, 500) || null;
  try {
    const order = await adminCancelSpotOrderById(id);
    void logAdminAction(req, {
      action: "order.force_cancel", entity: "order", entityId: id,
      payload: { reason, userId: order.userId, side: order.side, isBot: order.isBot },
    });
    res.json(order);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// ─── Admin: audit log viewer ────────────────────────────────────────────
router.get("/admin/audit-logs", adminOnly, async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const conds: any[] = [];
  if (q.actorId) conds.push(eq(auditLogsTable.actorId, Number(q.actorId)));
  if (q.entity) conds.push(eq(auditLogsTable.entity, q.entity));
  if (q.action) conds.push(eq(auditLogsTable.action, q.action));
  if (q.entityId) conds.push(eq(auditLogsTable.entityId, q.entityId));
  const limit = Math.min(Number(q.limit ?? 200), 500);
  const offset = Math.max(Number(q.offset ?? 0), 0);
  const where = conds.length ? and(...conds) : undefined;
  const rows = where
    ? await db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.id)).limit(limit).offset(offset)
    : await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.id)).limit(limit).offset(offset);
  // Hydrate actor email/name in a single follow-up query so the UI can render
  // human labels without N+1 round-trips.
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter((v): v is number => v !== null)));
  const actors = actorIds.length
    ? await db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role })
        .from(usersTable).where(or(...actorIds.map((id) => eq(usersTable.id, id))))
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  res.json(rows.map((r) => ({
    ...r,
    actor: r.actorId ? actorMap.get(r.actorId) ?? null : null,
  })));
});

router.get("/admin/audit-logs/stats", adminOnly, async (_req, res): Promise<void> => {
  const stats = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24h,
      COUNT(DISTINCT actor_id) FILTER (WHERE actor_id IS NOT NULL)::int AS distinct_actors,
      COUNT(DISTINCT entity)::int AS distinct_entities
    FROM audit_logs
  `);
  res.json((stats as any).rows?.[0] ?? (stats as any)[0] ?? {});
});

// Users
router.get("/admin/users", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(500);
  res.json(rows.map(sanitizeUser));
});

router.patch("/admin/users/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const allowed: Record<string, unknown> = {};
  for (const k of ["role", "status", "kycLevel", "vipTier", "name"]) {
    if (k in (req.body ?? {})) allowed[k] = req.body[k];
  }
  if (Object.keys(allowed).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [user] = await db.update(usersTable).set(allowed).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  void logAdminAction(req, { action: "user.update", entity: "user", entityId: id, payload: allowed });
  res.json(sanitizeUser(user));
});

// Coins CRUD
router.get("/admin/coins", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(coinsTable).orderBy(desc(coinsTable.createdAt));
  res.json(rows);
});
const CreateCoinBody = z.object({
  symbol:        z.string().min(1).max(20).transform(s => s.toUpperCase()),
  name:          z.string().min(1).max(100),
  type:          z.enum(["crypto", "fiat", "stablecoin", "token"]).default("crypto"),
  decimals:      z.coerce.number().int().min(0).max(18).default(8),
  logoUrl:       z.string().url().optional().nullable(),
  description:   z.string().max(2000).optional().nullable(),
  status:        z.enum(["active", "inactive", "delisted"]).default("active"),
  isListed:      z.boolean().default(true),
  listingAt:     z.string().datetime().optional().nullable(),
  currentPrice:  z.coerce.number().nonnegative().default(0),
  binanceSymbol: z.string().max(20).optional().nullable(),
  priceSource:   z.enum(["binance", "manual", "coingecko"]).default("binance"),
  manualPrice:   z.coerce.number().nonnegative().optional().nullable(),
  infoUrl:       z.string().url().optional().nullable(),
});

router.post("/admin/coins", adminOnly, async (req, res): Promise<void> => {
  const parsed = CreateCoinBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first?.message || "Invalid input", field: first?.path?.join(".") });
    return;
  }
  const d = parsed.data;
  const [coin] = await db.insert(coinsTable).values({
    symbol:        d.symbol,
    name:          d.name,
    type:          d.type,
    decimals:      d.decimals,
    logoUrl:       d.logoUrl ?? null,
    description:   d.description ?? null,
    status:        d.status,
    isListed:      d.isListed,
    listingAt:     d.listingAt ? new Date(d.listingAt) : null,
    currentPrice:  String(d.currentPrice),
    binanceSymbol: d.binanceSymbol ?? null,
    priceSource:   d.priceSource,
    manualPrice:   d.manualPrice != null ? String(d.manualPrice) : null,
    infoUrl:       d.infoUrl ?? null,
  }).returning();
  res.status(201).json(coin);
});
router.patch("/admin/coins/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const src = req.body ?? {};
  const ALLOWED_COIN_FIELDS = new Set([
    "symbol", "name", "type", "decimals", "logoUrl", "description", "status",
    "isListed", "listingAt", "marketCapRank", "binanceSymbol", "priceSource",
    "manualPrice", "infoUrl",
  ]);
  const b: Record<string, any> = {};
  for (const key of ALLOWED_COIN_FIELDS) {
    if (key in src) b[key] = src[key];
  }
  if (b.listingAt) b.listingAt = new Date(b.listingAt);
  if (b.manualPrice !== undefined && b.manualPrice !== null) b.manualPrice = String(b.manualPrice);
  if (Object.keys(b).length === 0) { res.status(400).json({ error: "No valid fields to update" }); return; }
  const [coin] = await db.update(coinsTable).set(b).where(eq(coinsTable.id, id)).returning();
  if (!coin) { res.status(404).json({ error: "Not found" }); return; }
  void logAdminAction(req, { action: "coin.update", entity: "coin", entityId: id, payload: b });
  res.json(coin);
});
router.delete("/admin/coins/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(coinsTable).where(eq(coinsTable.id, id));
  res.sendStatus(204);
});

// Binance discovery — returns USDT-quoted coins on Binance not yet in our DB.
// Sorted by 24h USDT volume descending, capped at top 150.
router.get("/admin/coins/binance-discover", adminOnly, async (_req, res): Promise<void> => {
  // Fetch Binance 24hr tickers (public, no key needed)
  const bnResp = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    signal: AbortSignal.timeout(8000),
  });
  if (!bnResp.ok) {
    res.status(502).json({ error: "Binance API unavailable" });
    return;
  }
  const tickers = await bnResp.json() as Array<{
    symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string;
  }>;

  // Only consider USDT-quoted pairs (most liquid, easiest to map 1-to-1 with a base coin)
  const usdtPairs = tickers
    .filter((t) => t.symbol.endsWith("USDT"))
    .map((t) => ({
      baseSymbol: t.symbol.slice(0, -4),   // strip "USDT"
      binanceSymbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      priceChangePercent: Number(t.priceChangePercent),
      quoteVolume: Number(t.quoteVolume),
    }))
    .filter((t) => t.baseSymbol.length >= 2 && t.baseSymbol.length <= 12)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 150);

  // Get every symbol we already track
  const existing = await db.select({ symbol: coinsTable.symbol }).from(coinsTable);
  const existingSet = new Set(existing.map((c) => c.symbol.toUpperCase()));

  const newCoins = usdtPairs.filter((t) => !existingSet.has(t.baseSymbol.toUpperCase()));

  res.json(newCoins.map((c) => ({
    symbol: c.baseSymbol.toUpperCase(),
    // Suggested name: same as symbol for now — admin can refine before saving
    suggestedName: c.baseSymbol.charAt(0).toUpperCase() + c.baseSymbol.slice(1).toLowerCase(),
    binanceSymbol: c.binanceSymbol,
    lastPrice: c.lastPrice,
    priceChangePercent: c.priceChangePercent,
    quoteVolume: c.quoteVolume,
    // Logo hint: well-known CDN keyed by lowercase symbol (graceful 404 on unknowns)
    logoUrl: `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${c.baseSymbol.toLowerCase()}.svg`,
  })));
});

// Networks
router.get("/admin/networks", supportPlus, async (req, res): Promise<void> => {
  const coinId = req.query.coinId ? Number(req.query.coinId) : null;
  const rows = coinId
    ? await db.select().from(networksTable).where(eq(networksTable.coinId, coinId))
    : await db.select().from(networksTable);
  // Mask secrets before returning
  const masked = rows.map(n => ({
    ...n,
    rpcApiKey: n.rpcApiKey ? maskSecret(n.rpcApiKey) : null,
    rpcApiKeySet: !!n.rpcApiKey,
    hotWalletPrivateKeyEnc: undefined,
    hotWalletKeySet: !!n.hotWalletPrivateKeyEnc,
    autoSweepEnabled: n.autoSweepEnabled,
  }));
  res.json(masked);
});

router.post("/admin/networks/:id/test", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [n] = await db.select().from(networksTable).where(eq(networksTable.id, id)).limit(1);
  if (!n) { res.status(404).json({ error: "Not found" }); return; }
  const result = await testNode({ providerType: n.providerType, chain: n.chain, rpcUrl: n.nodeAddress || "", apiKeyEnc: n.rpcApiKey });
  await db.update(networksTable).set({
    nodeStatus: result.ok ? "online" : "offline",
    lastNodeCheckAt: new Date(),
    lastBlockHeight: result.blockHeight ?? n.lastBlockHeight,
    blockHeightCheckedAt: result.blockHeight ? new Date() : n.blockHeightCheckedAt,
  }).where(eq(networksTable.id, id));
  res.json(result);
});
router.post("/admin/networks", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.coinId || !b.name || !b.chain) {
    res.status(400).json({ error: "coinId, name, chain required" });
    return;
  }
  const [n] = await db.insert(networksTable).values({
    coinId: Number(b.coinId),
    name: b.name,
    chain: b.chain,
    contractAddress: b.contractAddress ?? null,
    minDeposit: String(b.minDeposit ?? "0"),
    minWithdraw: String(b.minWithdraw ?? "0"),
    withdrawFee: String(b.withdrawFee ?? "0"),
    withdrawFeePercent: String(b.withdrawFeePercent ?? "0"),
    withdrawFeeMin: String(b.withdrawFeeMin ?? "0"),
    confirmations: Number(b.confirmations ?? 12),
    depositEnabled: b.depositEnabled ?? true,
    withdrawEnabled: b.withdrawEnabled ?? true,
    nodeAddress: b.nodeAddress ?? null,
    memoRequired: b.memoRequired ?? false,
  }).returning();
  res.status(201).json(n);
});
router.patch("/admin/networks/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const allowed = ["name", "chain", "contractAddress", "minDeposit", "minWithdraw", "withdrawFee",
    "withdrawFeePercent", "withdrawFeeMin",
    "confirmations", "depositEnabled", "withdrawEnabled", "nodeAddress", "memoRequired", "status",
    "providerType", "hotWalletAddress", "explorerUrl", "autoSweepEnabled", "autoWithdrawEnabled", "tokenDecimals"];
  const b: Record<string, any> = {};
  for (const k of allowed) if (req.body[k] !== undefined) b[k] = req.body[k];
  // Encrypted fields: only set if provided & non-empty (allows clearing with explicit null)
  if (req.body.rpcApiKey !== undefined) {
    b.rpcApiKey = req.body.rpcApiKey ? encryptSecret(String(req.body.rpcApiKey)) : null;
  }
  if (req.body.hotWalletPrivateKey !== undefined) {
    b.hotWalletPrivateKeyEnc = req.body.hotWalletPrivateKey ? encryptSecret(String(req.body.hotWalletPrivateKey)) : null;
  }
  for (const k of ["minDeposit", "minWithdraw", "withdrawFee"]) if (b[k] !== undefined) b[k] = String(b[k]);
  if (b.confirmations !== undefined) b.confirmations = Number(b.confirmations);
  const [n] = await db.update(networksTable).set(b).where(eq(networksTable.id, id)).returning();
  if (!n) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...n, rpcApiKey: maskSecret(n.rpcApiKey), hotWalletPrivateKeyEnc: undefined, hotWalletKeySet: !!n.hotWalletPrivateKeyEnc, rpcApiKeySet: !!n.rpcApiKey });
});
router.delete("/admin/networks/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(networksTable).where(eq(networksTable.id, id));
  res.sendStatus(204);
});

// Seed USDT BEP-20 + BSC network (idempotent — skips if already exists)
// POST /admin/seed/bsc-usdt
// Body (all optional overrides): { rpcUrl, hotWalletAddress, hotWalletPrivateKey, minWithdraw, withdrawFee, confirmations }
router.post("/admin/seed/bsc-usdt", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const USDT_SYMBOL = "USDT";
  const BSC_CHAIN = "BSC";
  const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
  const BSC_RPC_URL = b.rpcUrl || "https://bsc-dataseed.binance.org/";
  const BSC_EXPLORER = "https://bscscan.com";

  try {
    // 1. Upsert USDT coin
    const [existingCoin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, USDT_SYMBOL)).limit(1);
    let usdtCoinId: number;
    if (existingCoin) {
      // Ensure correct decimals for BEP-20 USDT (18)
      if (existingCoin.decimals !== 18) {
        await db.update(coinsTable).set({ decimals: 18 }).where(eq(coinsTable.id, existingCoin.id));
      }
      usdtCoinId = existingCoin.id;
    } else {
      const [created] = await db.insert(coinsTable).values({
        symbol: USDT_SYMBOL,
        name: "Tether USD",
        type: "crypto",
        decimals: 18,
        status: "active",
        isListed: true,
        priceSource: "manual",
        manualPrice: "1",
        currentPrice: "1",
        binanceSymbol: "USDTUSDT",
        logoUrl: "https://cryptologos.cc/logos/tether-usdt-logo.png",
      }).returning();
      usdtCoinId = created.id;
    }

    // 2. Upsert BSC network for USDT
    const [existingNet] = await db.select().from(networksTable)
      .where(and(eq(networksTable.coinId, usdtCoinId), eq(networksTable.chain, BSC_CHAIN))).limit(1);

    let network;
    if (existingNet) {
      const updates: Record<string, any> = {
        contractAddress: BSC_USDT_CONTRACT,
        nodeAddress: existingNet.nodeAddress || BSC_RPC_URL,
        explorerUrl: existingNet.explorerUrl || BSC_EXPLORER,
        status: "active",
        depositEnabled: true,
      };
      if (b.hotWalletAddress) updates.hotWalletAddress = b.hotWalletAddress;
      if (b.hotWalletPrivateKey) updates.hotWalletPrivateKeyEnc = encryptSecret(b.hotWalletPrivateKey);
      if (b.minWithdraw !== undefined) updates.minWithdraw = String(b.minWithdraw);
      if (b.withdrawFee !== undefined) updates.withdrawFee = String(b.withdrawFee);
      if (b.confirmations !== undefined) updates.confirmations = Number(b.confirmations);
      const [updated] = await db.update(networksTable).set(updates).where(eq(networksTable.id, existingNet.id)).returning();
      network = updated;
    } else {
      const vals: Record<string, any> = {
        coinId: usdtCoinId,
        name: "BNB Smart Chain (BEP-20)",
        chain: BSC_CHAIN,
        contractAddress: BSC_USDT_CONTRACT,
        nodeAddress: BSC_RPC_URL,
        explorerUrl: BSC_EXPLORER,
        confirmations: Number(b.confirmations ?? 15),
        minDeposit: String(b.minDeposit ?? "1"),
        minWithdraw: String(b.minWithdraw ?? "5"),
        withdrawFee: String(b.withdrawFee ?? "1"),
        withdrawFeePercent: "0",
        withdrawFeeMin: "0",
        depositEnabled: true,
        withdrawEnabled: true,
        autoSweepEnabled: false,
        autoWithdrawEnabled: false,
        status: "active",
        providerType: "custom",
        memoRequired: false,
      };
      if (b.hotWalletAddress) vals.hotWalletAddress = b.hotWalletAddress;
      if (b.hotWalletPrivateKey) vals.hotWalletPrivateKeyEnc = encryptSecret(b.hotWalletPrivateKey);
      const [created] = await db.insert(networksTable).values(vals as any).returning();
      network = created;
    }

    res.json({
      ok: true,
      coin: { id: usdtCoinId, symbol: USDT_SYMBOL, decimals: 18 },
      network: {
        id: network.id, name: network.name, chain: network.chain,
        contractAddress: network.contractAddress, nodeAddress: network.nodeAddress,
        confirmations: network.confirmations, minDeposit: network.minDeposit,
        minWithdraw: network.minWithdraw, withdrawFee: network.withdrawFee,
        depositEnabled: network.depositEnabled, withdrawEnabled: network.withdrawEnabled,
        autoSweepEnabled: network.autoSweepEnabled, autoWithdrawEnabled: network.autoWithdrawEnabled,
        hotWalletConfigured: !!network.hotWalletAddress && !!network.hotWalletPrivateKeyEnc,
        hotWalletAddress: network.hotWalletAddress,
        status: network.status,
      },
      message: existingNet ? "BSC USDT network updated" : "BSC USDT network created",
      nextSteps: !network.hotWalletAddress ? [
        `Set hot wallet: PATCH /api/admin/networks/${network.id} with { hotWalletAddress, hotWalletPrivateKey }`,
        `Enable auto-sweep: PATCH /api/admin/networks/${network.id} with { autoSweepEnabled: true }`,
        `Enable auto-withdraw: PATCH /api/admin/networks/${network.id} with { autoWithdrawEnabled: true }`,
      ] : [
        "Hot wallet configured. Enable autoSweepEnabled and autoWithdrawEnabled via admin panel.",
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Seed failed" });
  }
});

// Bulk toggle — PATCH /admin/networks/bulk
// Body: { ids?: number[], coinId?: number, all?: boolean, depositEnabled?: boolean, withdrawEnabled?: boolean, status?: string }
router.patch("/admin/networks/bulk", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  if (b.depositEnabled !== undefined) updates.depositEnabled = Boolean(b.depositEnabled);
  if (b.withdrawEnabled !== undefined) updates.withdrawEnabled = Boolean(b.withdrawEnabled);
  if (b.status !== undefined) updates.status = String(b.status);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  let where;
  if (b.all === true) {
    where = undefined; // all rows
  } else if (Array.isArray(b.ids) && b.ids.length > 0) {
    const { inArray } = await import("drizzle-orm");
    where = inArray(networksTable.id, b.ids.map(Number));
  } else if (b.coinId) {
    where = eq(networksTable.coinId, Number(b.coinId));
  } else {
    res.status(400).json({ error: "Provide ids[], coinId, or all:true" }); return;
  }

  const rows = where
    ? await db.update(networksTable).set(updates).where(where).returning()
    : await db.update(networksTable).set(updates).returning();
  res.json({ updated: rows.length });
});

// Pairs
router.get("/admin/pairs", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(pairsTable).orderBy(desc(pairsTable.createdAt));
  res.json(rows);
});
const CreatePairBody = z.object({
  symbol:         z.string().min(1).max(30).transform(s => s.toUpperCase()),
  baseCoinId:     z.coerce.number().int().positive(),
  quoteCoinId:    z.coerce.number().int().positive(),
  minQty:         z.coerce.number().nonnegative().default(0),
  maxQty:         z.coerce.number().nonnegative().default(0),
  pricePrecision: z.coerce.number().int().min(0).max(10).default(2),
  qtyPrecision:   z.coerce.number().int().min(0).max(10).default(4),
  takerFee:       z.coerce.number().nonnegative().max(1).default(0.001),
  makerFee:       z.coerce.number().nonnegative().max(1).default(0.001),
  tradingEnabled: z.boolean().default(true),
  futuresEnabled: z.boolean().default(false),
  tradingStartAt: z.string().datetime().optional().nullable(),
  futuresStartAt: z.string().datetime().optional().nullable(),
  description:    z.string().max(2000).optional().nullable(),
  status:         z.enum(["active", "inactive", "delisted"]).default("active"),
});

router.post("/admin/pairs", adminOnly, async (req, res): Promise<void> => {
  const parsed = CreatePairBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first?.message || "Invalid input", field: first?.path?.join(".") });
    return;
  }
  const d = parsed.data;
  const [p] = await db.insert(pairsTable).values({
    symbol:         d.symbol,
    baseCoinId:     d.baseCoinId,
    quoteCoinId:    d.quoteCoinId,
    minQty:         String(d.minQty),
    maxQty:         String(d.maxQty),
    pricePrecision: d.pricePrecision,
    qtyPrecision:   d.qtyPrecision,
    takerFee:       String(d.takerFee),
    makerFee:       String(d.makerFee),
    tradingEnabled: d.tradingEnabled,
    futuresEnabled: d.futuresEnabled,
    tradingStartAt: d.tradingStartAt ? new Date(d.tradingStartAt) : null,
    futuresStartAt: d.futuresStartAt ? new Date(d.futuresStartAt) : null,
    description:    d.description ?? null,
    status:         d.status,
  }).returning();
  res.status(201).json(p);
});
router.patch("/admin/pairs/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const b: Record<string, any> = { ...req.body };
  delete b.id; delete b.createdAt;
  if (b.tradingStartAt) b.tradingStartAt = new Date(b.tradingStartAt);
  if (b.futuresStartAt) b.futuresStartAt = new Date(b.futuresStartAt);
  for (const k of ["minQty", "maxQty", "takerFee", "makerFee", "lastPrice", "volume24h", "change24h", "high24h", "low24h", "quoteVolume24h"]) {
    if (b[k] !== undefined && b[k] !== null) b[k] = String(b[k]);
  }
  const [p] = await db.update(pairsTable).set(b).where(eq(pairsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(p);
});
router.delete("/admin/pairs/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(pairsTable).where(eq(pairsTable.id, id));
  res.sendStatus(204);
});

// Market-Maker Bots
router.get("/admin/bots", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(marketBotsTable).orderBy(desc(marketBotsTable.createdAt));
  res.json(rows);
});
router.post("/admin/bots", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.pairId) { res.status(400).json({ error: "pairId required" }); return; }
  try {
    const [row] = await db.insert(marketBotsTable).values({
      pairId: Number(b.pairId),
      enabled: !!b.enabled,
      spreadBps: Number(b.spreadBps ?? 20),
      levels: Number(b.levels ?? 5),
      priceStepBps: Number(b.priceStepBps ?? 10),
      orderSize: String(b.orderSize ?? "0.01"),
      refreshSec: Number(b.refreshSec ?? 8),
      maxOrderAgeSec: Number(b.maxOrderAgeSec ?? 60),
      fillOnCross: b.fillOnCross !== false,
      spotEnabled: b.spotEnabled !== false,
      futuresEnabled: !!b.futuresEnabled,
      topOfBookBoostPct: Number(b.topOfBookBoostPct ?? 50),
      marketTakerEnabled: !!b.marketTakerEnabled,
      marketTakerSizeMult: String(b.marketTakerSizeMult ?? "2.00"),
      priceMoveTriggerBps: Number(b.priceMoveTriggerBps ?? 30),
      bigOrderTriggerQty: String(b.bigOrderTriggerQty ?? "0"),
      bigOrderAbsorbMult: String(b.bigOrderAbsorbMult ?? "1.50"),
      marketTakerCooldownSec: Number(b.marketTakerCooldownSec ?? 30),
      startAt: b.startAt ? new Date(b.startAt) : null,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(400).json({ error: e?.message?.includes("unique") ? "Bot already exists for this pair" : "Failed to create bot" });
  }
});
router.patch("/admin/bots/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const allowed = ["enabled", "spreadBps", "levels", "priceStepBps", "orderSize", "refreshSec", "maxOrderAgeSec", "fillOnCross", "spotEnabled", "futuresEnabled", "startAt", "topOfBookBoostPct", "marketTakerEnabled", "marketTakerSizeMult", "priceMoveTriggerBps", "bigOrderTriggerQty", "bigOrderAbsorbMult", "marketTakerCooldownSec"];
  const b: Record<string, any> = {};
  for (const k of allowed) if (req.body[k] !== undefined) b[k] = req.body[k];
  for (const k of ["orderSize", "marketTakerSizeMult", "bigOrderTriggerQty", "bigOrderAbsorbMult"]) {
    if (b[k] !== undefined) b[k] = String(b[k]);
  }
  for (const k of ["spreadBps", "levels", "priceStepBps", "refreshSec", "maxOrderAgeSec", "topOfBookBoostPct", "priceMoveTriggerBps", "marketTakerCooldownSec"]) {
    if (b[k] !== undefined) b[k] = Number(b[k]);
  }
  if (b.startAt !== undefined) b.startAt = b.startAt ? new Date(b.startAt) : null;
  if (Object.keys(b).length === 0) { res.status(400).json({ error: "No updatable fields" }); return; }
  const [row] = await db.update(marketBotsTable).set(b).where(eq(marketBotsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});
router.delete("/admin/bots/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(marketBotsTable).where(eq(marketBotsTable.id, id));
  res.sendStatus(204);
});

// Orders & Trades (read-only for admin)
router.get("/admin/orders", supportPlus, async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const conds: any[] = [];
  if (q.status) conds.push(eq(ordersTable.status, q.status));
  if (q.side) conds.push(eq(ordersTable.side, q.side));
  if (q.pairId) conds.push(eq(ordersTable.pairId, Number(q.pairId)));
  if (q.userId) conds.push(eq(ordersTable.userId, Number(q.userId)));
  if (q.isBot === "1") conds.push(sql`${ordersTable.isBot} = 1`);
  if (q.isBot === "0") conds.push(sql`${ordersTable.isBot} = 0`);
  const limit = Math.min(Number(q.limit ?? 200), 500);
  const where = conds.length ? and(...conds) : undefined;
  const rows = where
    ? await db.select().from(ordersTable).where(where).orderBy(desc(ordersTable.id)).limit(limit)
    : await db.select().from(ordersTable).orderBy(desc(ordersTable.id)).limit(limit);
  res.json(rows);
});

router.get("/admin/orders/stats", supportPlus, async (_req, res): Promise<void> => {
  const stats = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
      COUNT(*) FILTER (WHERE status = 'filled')::int AS filled_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      COUNT(*) FILTER (WHERE side = 'buy')::int AS buy_count,
      COUNT(*) FILTER (WHERE side = 'sell')::int AS sell_count,
      COUNT(*) FILTER (WHERE is_bot = 1)::int AS bot_count,
      COUNT(*) FILTER (WHERE is_bot = 0)::int AS user_count,
      COUNT(*) FILTER (WHERE status = 'filled' AND is_bot = 1)::int AS bot_filled,
      COUNT(*) FILTER (WHERE status = 'filled' AND is_bot = 0)::int AS user_filled,
      COALESCE(SUM(filled_qty * avg_price) FILTER (WHERE status = 'filled'), 0) AS filled_value
    FROM orders
  `);
  res.json((stats as any).rows?.[0] ?? (stats as any)[0] ?? {});
});

router.get("/admin/trades", supportPlus, async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  // Each matched trade creates 2 DB rows — one for the taker, one for the maker.
  // By default we hide bot-order rows so admin sees exactly 1 row per match
  // (the real-user side). Pass ?includeBotTrades=1 to see both sides (debugging).
  const conds: any[] = [];
  if (q.includeBotTrades !== "1") {
    // Show only the taker-side row per match (is_taker = 1).
    // Each match inserts exactly 2 rows — taker (is_taker=1) + maker (is_taker=0).
    // Filtering on is_taker guarantees exactly 1 row per match regardless of
    // whether the counterparty is a bot or a real user.
    // Legacy rows (before migration 010) have is_taker=0 on both sides, so we
    // fall back to the old bot-filter for them via the OR clause.
    conds.push(
      sql`(${tradesTable.isTaker} = 1 OR (${tradesTable.isTaker} = 0 AND NOT EXISTS (SELECT 1 FROM ${ordersTable} WHERE ${ordersTable.id} = ${tradesTable.orderId} AND ${ordersTable.isBot} = 1)))`,
    );
  }
  if (q.pairId) conds.push(eq(tradesTable.pairId, Number(q.pairId)));
  if (q.userId) conds.push(eq(tradesTable.userId, Number(q.userId)));
  if (q.side) conds.push(eq(tradesTable.side, q.side));
  const limit = Math.min(Number(q.limit ?? 200), 500);
  const rows = await db.select().from(tradesTable)
    .where(and(...conds))
    .orderBy(desc(tradesTable.id))
    .limit(limit);
  res.json(rows);
});

// Gateways
router.get("/admin/gateways", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(gatewaysTable).orderBy(desc(gatewaysTable.createdAt)));
});
router.post("/admin/gateways", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.code || !b.name || !b.type || !b.direction) {
    res.status(400).json({ error: "code, name, type, direction required" });
    return;
  }
  const [g] = await db.insert(gatewaysTable).values({
    code: b.code,
    name: b.name,
    type: b.type,
    direction: b.direction,
    provider: b.provider ?? "manual",
    currency: b.currency ?? "INR",
    minAmount: String(b.minAmount ?? "0"),
    maxAmount: String(b.maxAmount ?? "0"),
    feeFlat: String(b.feeFlat ?? "0"),
    feePercent: String(b.feePercent ?? "0"),
    processingTime: b.processingTime ?? "Instant",
    isAuto: b.isAuto ?? (b.provider === "razorpay"),
    status: b.status ?? "active",
    apiKey: b.apiKey ?? null,
    apiSecret: b.apiSecret ?? null,
    webhookSecret: b.webhookSecret ?? null,
    testMode: b.testMode ?? true,
    logoUrl: b.logoUrl ?? null,
    config: typeof b.config === "string" ? b.config : JSON.stringify(b.config ?? {}),
  }).returning();
  res.status(201).json(g);
});
router.patch("/admin/gateways/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const b = req.body ?? {};
  const ALLOWED = [
    "name","type","direction","provider","currency","minAmount","maxAmount",
    "feeFlat","feePercent","processingTime","isAuto","status",
    "apiKey","apiSecret","webhookSecret","testMode","logoUrl","config",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (b[k] === undefined) continue;
    // Empty-string secrets = "do not change"
    if ((k === "apiKey" || k === "apiSecret" || k === "webhookSecret") && b[k] === "") continue;
    if (k === "config" && typeof b[k] !== "string") update[k] = JSON.stringify(b[k]);
    else if (k === "minAmount" || k === "maxAmount" || k === "feeFlat" || k === "feePercent") update[k] = String(b[k]);
    else update[k] = b[k];
  }
  if (Object.keys(update).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  update.updatedAt = new Date();
  const [g] = await db.update(gatewaysTable).set(update).where(eq(gatewaysTable.id, id)).returning();
  if (!g) { res.status(404).json({ error: "Not found" }); return; }
  res.json(g);
});
router.delete("/admin/gateways/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(gatewaysTable).where(eq(gatewaysTable.id, id));
  res.sendStatus(204);
});

// KYC moderation
router.get("/admin/kyc", supportPlus, async (req, res): Promise<void> => {
  const status = (req.query.status as string) || null;
  const rows = status
    ? await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.status, status)).orderBy(desc(kycRecordsTable.createdAt))
    : await db.select().from(kycRecordsTable).orderBy(desc(kycRecordsTable.createdAt));
  res.json(rows);
});
router.patch("/admin/kyc/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, rejectReason } = req.body ?? {};
  if (!["approved", "rejected", "pending", "rekyc_required"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const [rec] = await db.update(kycRecordsTable).set({
    status,
    rejectReason: rejectReason ?? null,
    reviewedBy: req.user!.id,
    reviewedAt: new Date(),
  }).where(eq(kycRecordsTable.id, id)).returning();
  if (!rec) { res.status(404).json({ error: "Not found" }); return; }
  if (status === "approved") {
    // Monotonic: never lower a user's KYC level
    await db.update(usersTable)
      .set({ kycLevel: sql`GREATEST(${usersTable.kycLevel}, ${rec.level})` })
      .where(eq(usersTable.id, rec.userId));
  }
  res.json(rec);
  // Check referral signup bonus — KYC approval may satisfy the KYC condition
  if (status === "approved") {
    checkAndCreditRegistrationBonus(rec.userId).catch(() => null);
  }
  // Fire-and-forget KYC status email
  const [kycUser] = await db.select().from(usersTable).where(eq(usersTable.id, rec.userId)).limit(1);
  if (kycUser?.email) {
    if (status === "approved") {
      sendKycApprovedEmail(kycUser.email, { name: kycUser.name || undefined, level: rec.level }).catch(() => {});
    } else if (status === "rejected") {
      sendKycRejectedEmail(kycUser.email, {
        name: kycUser.name || undefined,
        level: rec.level,
        reason: (rejectReason as string | undefined) || "Please contact support for details.",
      }).catch(() => {});
    }
  }
});

// Admin-initiated Re-KYC: marks an approved record as needing re-submission.
// Optionally drops the user's effective kycLevel so the user must resubmit.
router.post("/admin/kyc/:id/request-rekyc", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const dropLevel = req.body?.dropLevel === true;
  if (!reason || reason.length < 4) {
    res.status(400).json({ error: "A reason (min 4 chars) is required for Re-KYC" }); return;
  }
  if (reason.length > 500) {
    res.status(400).json({ error: "Reason too long (max 500 chars)" }); return;
  }
  const [existing] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Record not found" }); return; }
  if (existing.status !== "approved") {
    res.status(400).json({ error: "Only approved submissions can be sent back for Re-KYC" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const [rec] = await tx.update(kycRecordsTable).set({
      status: "rekyc_required",
      rejectReason: reason,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
    }).where(eq(kycRecordsTable.id, id)).returning();
    let newKycLevel: number | null = null;
    if (dropLevel) {
      // Recompute the user's effective KYC level from remaining approved records.
      const remaining = await tx.select().from(kycRecordsTable)
        .where(and(eq(kycRecordsTable.userId, rec.userId), eq(kycRecordsTable.status, "approved")));
      const maxLevel = remaining.reduce((m, r) => (r.level > m ? r.level : m), 0);
      await tx.update(usersTable).set({ kycLevel: maxLevel }).where(eq(usersTable.id, rec.userId));
      newKycLevel = maxLevel;
    }
    return { record: rec, newKycLevel };
  });
  res.json(result);
});
// AI-suggested rejection reasons for a KYC submission
router.post("/admin/kyc/:id/suggest-reasons", supportPlus, async (req, res): Promise<void> => {
  if (!isOpenAIConfigured()) {
    res.status(503).json({ error: "AI is not configured on this server" });
    return;
  }
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [rec] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.id, id)).limit(1);
  if (!rec) { res.status(404).json({ error: "Not found" }); return; }

  let extraObj: Record<string, unknown> = {};
  try { const v = JSON.parse(rec.extra ?? "{}"); if (v && typeof v === "object") extraObj = v as Record<string, unknown>; } catch { /* ignore */ }

  const aadhaarMasked = rec.aadhaarNumber ? "XXXX-XXXX-" + rec.aadhaarNumber.slice(-4) : null;
  const panRedacted = rec.panNumber ? rec.panNumber.slice(0, 3) + "XX" + rec.panNumber.slice(-2) : null;
  const docs = {
    panDocProvided: !!rec.panDocUrl,
    aadhaarDocProvided: !!rec.aadhaarDocUrl,
    selfieProvided: !!rec.selfieUrl,
  };

  const userHint = typeof req.body?.note === "string" ? String(req.body.note).slice(0, 300) : "";

  const submission = {
    level: rec.level,
    fullName: rec.fullName ?? null,
    dob: rec.dob ?? null,
    address: rec.address ? rec.address.slice(0, 200) : null,
    panNumber: panRedacted,
    aadhaarNumber: aadhaarMasked,
    documents: docs,
    extraFields: Object.keys(extraObj),
    submittedAt: rec.createdAt,
  };

  const sys =
    "You are a senior KYC compliance reviewer for an Indian crypto exchange (Zebvix). " +
    "Generate concise, polite rejection reasons that a user can act on. " +
    "Keep each reason between 6 and 18 words. No numbering, no quotes, no markdown. " +
    "Avoid revealing internal policy. Reply with a JSON object: " +
    `{"reasons": ["...", "...", "..."]}. Always return 4 to 5 distinct, plausible reasons ` +
    "that fit the data shown. Mention specific missing or invalid items when applicable.";

  const usr =
    "Submission summary (PII masked):\n" +
    JSON.stringify(submission, null, 2) +
    (userHint ? `\n\nReviewer note (use as context): ${userHint}` : "");

  try {
    const raw = await chatComplete(
      [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      { model: "gpt-5-mini", maxTokens: 4096, timeoutMs: 25_000 },
    );
    let reasons: string[] = [];
    const tryParse = (s: string) => {
      try {
        const v = JSON.parse(s);
        if (v && Array.isArray(v.reasons)) return v.reasons.filter((x: unknown) => typeof x === "string" && x.trim().length > 0).map((x: string) => x.trim());
      } catch { /* ignore */ }
      return null;
    };
    reasons = tryParse(raw) ?? [];
    if (reasons.length === 0) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) reasons = tryParse(m[0]) ?? [];
    }
    if (reasons.length === 0) {
      reasons = raw.split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter((l) => l.length > 4 && l.length < 200).slice(0, 5);
    }
    if (reasons.length === 0) {
      res.status(502).json({ error: "AI returned no usable reasons" });
      return;
    }
    res.json({ reasons: reasons.slice(0, 5) });
  } catch (err: unknown) {
    if (err instanceof OpenAIError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

router.get("/admin/kyc-settings", supportPlus, async (_req, res): Promise<void> => {
  // Auto-seed default templates the first time admin opens the page
  const existing = await db.select().from(kycSettingsTable).orderBy(kycSettingsTable.level);
  const byLevel = new Map(existing.map((r) => [r.level, r] as const));
  const seedRows = [];
  for (const lvl of [1, 2, 3] as const) {
    const tpl = DEFAULT_KYC_TEMPLATES[lvl];
    const cur = byLevel.get(lvl);
    if (!cur) {
      seedRows.push({
        level: lvl,
        name: tpl.name,
        description: tpl.description,
        depositLimit: lvl === 1 ? "50000" : lvl === 2 ? "500000" : "2500000",
        withdrawLimit: lvl === 1 ? "25000" : lvl === 2 ? "250000" : "1500000",
        tradeLimit: lvl === 1 ? "100000" : lvl === 2 ? "1000000" : "10000000",
        features: JSON.stringify(lvl === 1 ? ["deposit", "trade"] : lvl === 2 ? ["deposit", "trade", "withdraw"] : ["deposit", "trade", "withdraw", "futures", "earn"]),
        fields: JSON.stringify(tpl.fields),
        enabled: true,
      });
    } else if (!cur.fields || cur.fields === "[]") {
      // Backfill fields-only when a row exists from before this feature shipped
      await db.update(kycSettingsTable).set({
        fields: JSON.stringify(tpl.fields),
        name: cur.name && cur.name.length > 0 ? cur.name : tpl.name,
        description: cur.description && cur.description.length > 0 ? cur.description : tpl.description,
      }).where(eq(kycSettingsTable.level, lvl));
    }
  }
  if (seedRows.length > 0) {
    await db.insert(kycSettingsTable).values(seedRows);
  }
  res.json(await db.select().from(kycSettingsTable).orderBy(kycSettingsTable.level));
});
router.patch("/admin/kyc-settings/:level", adminOnly, async (req, res): Promise<void> => {
  const level = Number(Array.isArray(req.params.level) ? req.params.level[0] : req.params.level);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  const stringFields: Array<"name" | "description" | "depositLimit" | "withdrawLimit" | "tradeLimit"> = [
    "name", "description", "depositLimit", "withdrawLimit", "tradeLimit",
  ];
  for (const k of stringFields) {
    if (typeof body[k] === "string") update[k] = body[k];
  }
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;

  // features: must be JSON array of strings
  if (body.features !== undefined) {
    let parsed: unknown = body.features;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { res.status(400).json({ error: "features must be a JSON array" }); return; }
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      res.status(400).json({ error: "features must be an array of strings" }); return;
    }
    update.features = JSON.stringify(parsed);
  }

  // fields: must be JSON array of field defs
  if (body.fields !== undefined) {
    let parsed: unknown = body.fields;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { res.status(400).json({ error: "fields must be a JSON array" }); return; }
    }
    if (!Array.isArray(parsed)) { res.status(400).json({ error: "fields must be an array" }); return; }
    const seenKeys = new Set<string>();
    const cleaned = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") { res.status(400).json({ error: "each field must be an object" }); return; }
      const f = raw as Record<string, unknown>;
      const key = typeof f.key === "string" ? f.key.trim() : "";
      if (!key) { res.status(400).json({ error: "each field needs a non-empty key" }); return; }
      if (seenKeys.has(key)) { res.status(400).json({ error: `duplicate field key: ${key}` }); return; }
      seenKeys.add(key);
      const type = typeof f.type === "string" ? f.type : "text";
      const allowedTypes = ["text", "textarea", "date", "number", "identity", "image", "select"];
      if (!allowedTypes.includes(type)) { res.status(400).json({ error: `invalid type for ${key}: ${type}` }); return; }
      if (typeof f.regex === "string" && f.regex.length > 0) {
        try { new RegExp(f.regex); } catch { res.status(400).json({ error: `invalid regex for ${key}` }); return; }
      }
      cleaned.push({
        key,
        label: typeof f.label === "string" && f.label.length > 0 ? f.label : key,
        type,
        required: Boolean(f.required),
        regex: typeof f.regex === "string" && f.regex.length > 0 ? f.regex : undefined,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
        helperText: typeof f.helperText === "string" ? f.helperText : undefined,
        options: Array.isArray(f.options) ? f.options.filter((o) => typeof o === "string") : undefined,
      });
    }
    update.fields = JSON.stringify(cleaned);
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "no editable fields supplied" }); return;
  }

  const [s] = await db.update(kycSettingsTable).set(update).where(eq(kycSettingsTable.level, level)).returning();
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  res.json(s);
});

// Bank approvals
// ─── Bank policy (max banks per user, max edits/deletes) ──────────────────
const BANK_POLICY_KEY = "bank.policy";
type BankPolicy = { maxPerUser: number; maxEdits: number; maxDeletes: number };
const DEFAULT_BANK_POLICY: BankPolicy = { maxPerUser: 1, maxEdits: 3, maxDeletes: 3 };

export async function getBankPolicy(): Promise<BankPolicy> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, BANK_POLICY_KEY)).limit(1);
  if (!row) return { ...DEFAULT_BANK_POLICY };
  try {
    const parsed = JSON.parse(row.value) as Partial<BankPolicy>;
    return {
      maxPerUser: Math.max(1, Math.min(20, Number(parsed.maxPerUser ?? DEFAULT_BANK_POLICY.maxPerUser))),
      maxEdits: Math.max(0, Math.min(50, Number(parsed.maxEdits ?? DEFAULT_BANK_POLICY.maxEdits))),
      maxDeletes: Math.max(0, Math.min(50, Number(parsed.maxDeletes ?? DEFAULT_BANK_POLICY.maxDeletes))),
    };
  } catch { return { ...DEFAULT_BANK_POLICY }; }
}

// Compute a 0-100 similarity score between two name strings.
// Normalizes (lowercase, strip non-letters, collapse spaces) then uses
// Levenshtein-based ratio + token-overlap as a tiebreaker.
function normalizeName(s: string): string {
  // Unicode-aware: NFKD strip diacritics, keep any letter from any script, collapse spaces
  const decomposed = s.normalize("NFKD").replace(/\p{M}/gu, "");
  return decomposed.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
export function nameSimilarity(holder: string | null, kyc: string | null): { score: number; label: "match" | "partial" | "mismatch" | "unknown" } {
  if (!holder || !kyc) return { score: 0, label: "unknown" };
  const a = normalizeName(holder);
  const b = normalizeName(kyc);
  if (!a || !b) return { score: 0, label: "unknown" };
  const dist = levenshtein(a, b);
  const editScore = Math.max(0, Math.round(100 * (1 - dist / Math.max(a.length, b.length))));
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = new Set(b.split(" ").filter(Boolean));
  const inter = [...at].filter((x) => bt.has(x)).length;
  const tokenScore = at.size && bt.size ? Math.round((100 * (2 * inter)) / (at.size + bt.size)) : 0;
  const score = Math.max(editScore, tokenScore);
  const label: "match" | "partial" | "mismatch" =
    score >= 90 ? "match" : score >= 60 ? "partial" : "mismatch";
  return { score, label };
}

async function latestKycName(userId: number): Promise<string | null> {
  const rows = await db.select().from(kycRecordsTable)
    .where(and(eq(kycRecordsTable.userId, userId), eq(kycRecordsTable.status, "approved")))
    .orderBy(desc(kycRecordsTable.level), desc(kycRecordsTable.reviewedAt))
    .limit(1);
  return rows[0]?.fullName ?? null;
}

// GET banks (extended) — includes user info and live KYC name match
router.get("/admin/banks", supportPlus, async (req, res): Promise<void> => {
  const status = (req.query.status as string) || null;
  const rows = status
    ? await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.status, status)).orderBy(desc(bankAccountsTable.createdAt))
    : await db.select().from(bankAccountsTable).orderBy(desc(bankAccountsTable.createdAt));
  if (rows.length === 0) { res.json([]); return; }
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await db.select().from(usersTable).where(or(...userIds.map((id) => eq(usersTable.id, id))));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const kycRows = await db.select().from(kycRecordsTable)
    .where(and(eq(kycRecordsTable.status, "approved"), or(...userIds.map((id) => eq(kycRecordsTable.userId, id)))))
    .orderBy(desc(kycRecordsTable.level));
  const kycByUser = new Map<number, string>();
  for (const k of kycRows) {
    if (k.fullName && !kycByUser.has(k.userId)) kycByUser.set(k.userId, k.fullName);
  }
  const enriched = rows.map((b) => {
    const u = userMap.get(b.userId);
    const kycName = kycByUser.get(b.userId) ?? null;
    const sim = nameSimilarity(b.holderName, kycName);
    return {
      ...b,
      user: u ? { id: u.id, uid: u.uid, email: u.email, name: u.name, kycLevel: u.kycLevel, status: u.status, bankEditCount: 0, bankDeleteCount: 0 } : null,
      kycName,
      nameMatchLive: sim.label,
      nameMatchScoreLive: sim.score,
    };
  });
  res.json(enriched);
});

// Stats
router.get("/admin/banks/stats", supportPlus, async (_req, res): Promise<void> => {
  const all = await db.select().from(bankAccountsTable);
  let pending = 0, verified = 0, rejected = 0;
  for (const b of all) {
    if (b.status === "verified") verified++;
    else if (b.status === "rejected") rejected++;
    else if (b.status === "deleted") continue;
    else pending++;
  }
  // Compute mismatches over all banks (using stored or live)
  const userIds = [...new Set(all.map((r) => r.userId))];
  let mismatches = 0;
  if (userIds.length > 0) {
    const kycRows = await db.select().from(kycRecordsTable)
      .where(and(eq(kycRecordsTable.status, "approved"), or(...userIds.map((id) => eq(kycRecordsTable.userId, id)))))
      .orderBy(desc(kycRecordsTable.level));
    const kycByUser = new Map<number, string>();
    for (const k of kycRows) {
      if (k.fullName && !kycByUser.has(k.userId)) kycByUser.set(k.userId, k.fullName);
    }
    for (const b of all) {
      const sim = nameSimilarity(b.holderName, kycByUser.get(b.userId) ?? null);
      if (sim.label === "mismatch") mismatches++;
    }
  }
  res.json({ total: all.length, pending, verified, rejected, mismatches });
});

// Policy
router.get("/admin/banks/policy", supportPlus, async (_req, res): Promise<void> => {
  res.json(await getBankPolicy());
});
router.put("/admin/banks/policy", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const next: BankPolicy = {
    maxPerUser: Math.max(1, Math.min(20, Number(b.maxPerUser ?? DEFAULT_BANK_POLICY.maxPerUser))),
    maxEdits: Math.max(0, Math.min(50, Number(b.maxEdits ?? DEFAULT_BANK_POLICY.maxEdits))),
    maxDeletes: Math.max(0, Math.min(50, Number(b.maxDeletes ?? DEFAULT_BANK_POLICY.maxDeletes))),
  };
  const value = JSON.stringify(next);
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, BANK_POLICY_KEY)).limit(1);
  if (existing.length === 0) {
    await db.insert(settingsTable).values({ key: BANK_POLICY_KEY, value });
  } else {
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, BANK_POLICY_KEY));
  }
  res.json(next);
});

// Patch (verify/reject) — also persists computed name-match snapshot on verify
router.patch("/admin/banks/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, rejectReason } = req.body ?? {};
  if (!["verified", "rejected", "under_review"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const [existing] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  let nameMatch: string | null = existing.nameMatch;
  let nameMatchScore: number | null = existing.nameMatchScore;
  if (status === "verified") {
    const kycName = await latestKycName(existing.userId);
    const sim = nameSimilarity(existing.holderName, kycName);
    nameMatch = sim.label;
    nameMatchScore = sim.score;
  }
  try {
    const [b] = await db.update(bankAccountsTable).set({
      status,
      rejectReason: rejectReason ?? null,
      reviewedBy: req.user!.id,
      verifiedAt: status === "verified" ? new Date() : null,
      nameMatch,
      nameMatchScore,
    }).where(eq(bankAccountsTable.id, id)).returning();
    res.json(b);
  } catch (e: any) {
    if (typeof e?.message === "string" && e.message.includes("bank_accounts_one_verified_per_user")) {
      res.status(409).json({ error: "User already has another verified bank account. Reject or remove it before verifying this one." });
      return;
    }
    throw e;
  }
});

// Re-check name match against user's latest approved KYC (writes moderation fields → admin only)
router.post("/admin/banks/:id/recheck-name", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [b] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id)).limit(1);
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  const kycName = await latestKycName(b.userId);
  const sim = nameSimilarity(b.holderName, kycName);
  const [updated] = await db.update(bankAccountsTable).set({
    nameMatch: sim.label, nameMatchScore: sim.score,
  }).where(eq(bankAccountsTable.id, id)).returning();
  res.json({ kycName, holderName: b.holderName, ...sim, record: updated });
});

// Full dossier for a single bank: bank + user + all banks of user + KYC name
router.get("/admin/banks/:id/full", supportPlus, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [bank] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id)).limit(1);
  if (!bank) { res.status(404).json({ error: "Not found" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, bank.userId)).limit(1);
  const allBanks = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, bank.userId)).orderBy(desc(bankAccountsTable.createdAt));
  const kycName = await latestKycName(bank.userId);
  const sim = nameSimilarity(bank.holderName, kycName);
  const policy = await getBankPolicy();
  res.json({
    bank,
    user: user ? sanitizeUser(user) : null,
    kycName,
    nameMatch: sim,
    allBanks,
    policy,
    counters: {
      banks: allBanks.length,
      verifiedBanks: allBanks.filter((b) => b.status === "verified").length,
      totalEdits: allBanks.reduce((s, b) => s + (b.editCount ?? 0), 0),
    },
  });
});

// AI-suggested rejection reasons for a bank account
router.post("/admin/banks/:id/suggest-reject-reasons", supportPlus, async (req, res): Promise<void> => {
  if (!isOpenAIConfigured()) {
    res.status(503).json({ error: "AI is not configured on this server" });
    return;
  }
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bank] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id)).limit(1);
  if (!bank) { res.status(404).json({ error: "Not found" }); return; }

  const kycName = await latestKycName(bank.userId);
  const sim = nameSimilarity(bank.holderName, kycName);
  const allBanks = await db.select().from(bankAccountsTable)
    .where(eq(bankAccountsTable.userId, bank.userId));
  const dupHolders = allBanks
    .filter((b) => b.id !== bank.id && b.status !== "deleted")
    .map((b) => ({ holder: b.holderName, status: b.status }));

  const ifsc = (bank.ifsc ?? "").toUpperCase();
  const ifscLooksValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  const acct = bank.accountNumber ?? "";
  const acctLooksValid = /^\d{6,20}$/.test(acct);

  const userHint = typeof req.body?.note === "string" ? String(req.body.note).slice(0, 300) : "";

  const submission = {
    holderName: bank.holderName,
    kycName: kycName ?? null,
    nameMatch: { label: sim.label, score: sim.score },
    bankName: bank.bankName,
    ifsc,
    ifscLooksValid,
    accountNumberLength: acct.length,
    accountNumberLooksValid: acctLooksValid,
    accountNumberLast4: acct.slice(-4),
    editCount: bank.editCount ?? 0,
    submittedAt: bank.createdAt,
    otherBanksOnFile: dupHolders,
  };

  const sys =
    "You are a senior banking-operations reviewer for an Indian crypto exchange (Zebvix). " +
    "Generate concise, polite rejection reasons for a user's bank account submission. " +
    "Each reason 6 to 18 words. No numbering, no quotes, no markdown, no PII. " +
    "Reply ONLY with a JSON object: " +
    `{"reasons": ["...", "...", "..."]}. Always return 4 to 5 distinct, plausible reasons ` +
    "that fit the data shown. Prioritize the strongest signal: name mismatch with KYC, " +
    "invalid IFSC/account format, suspicious holder spelling, duplicate holder across accounts, " +
    "or missing/illegible details. Do not reveal internal scores or thresholds.";

  const usr =
    "Bank submission summary (PII masked):\n" +
    JSON.stringify(submission, null, 2) +
    (userHint ? `\n\nReviewer note (use as context): ${userHint}` : "");

  try {
    const raw = await chatComplete(
      [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      { model: "gpt-5-mini", maxTokens: 4096, timeoutMs: 25_000 },
    );
    let reasons: string[] = [];
    const tryParse = (s: string) => {
      try {
        const v = JSON.parse(s);
        if (v && Array.isArray(v.reasons)) {
          return v.reasons
            .filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
            .map((x: string) => x.trim());
        }
      } catch { /* ignore */ }
      return null;
    };
    reasons = tryParse(raw) ?? [];
    if (reasons.length === 0) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) reasons = tryParse(m[0]) ?? [];
    }
    if (reasons.length === 0) {
      reasons = raw.split(/\r?\n/)
        .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter((l) => l.length > 4 && l.length < 200)
        .slice(0, 5);
    }
    if (reasons.length === 0) {
      res.status(502).json({ error: "AI returned no usable reasons" });
      return;
    }
    res.json({ reasons: reasons.slice(0, 5) });
  } catch (err: unknown) {
    if (err instanceof OpenAIError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

// INR deposits/withdrawals approval
router.get("/admin/inr-deposits", supportPlus, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const q = db.select().from(inrDepositsTable);
  const rows = status
    ? await q.where(eq(inrDepositsTable.status, status)).orderBy(desc(inrDepositsTable.createdAt)).limit(500)
    : await q.orderBy(desc(inrDepositsTable.createdAt)).limit(500);
  res.json(rows);
});
router.patch("/admin/inr-deposits/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, notes } = req.body ?? {};
  if (!["completed", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(inrDepositsTable).where(eq(inrDepositsTable.id, id)).for("update").limit(1);
      if (!current) { const e: any = new Error("Not found"); e.code = 404; throw e; }
      if (current.status === status) return current;
      // Money movement only when transitioning into 'completed'
      if (status === "completed" && current.status !== "completed") {
        const [inrCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
        if (!inrCoin) { const e: any = new Error("INR coin not configured"); e.code = 500; throw e; }
        const [w] = await tx.select().from(walletsTable)
          .where(and(eq(walletsTable.userId, current.userId), eq(walletsTable.coinId, inrCoin.id), eq(walletsTable.walletType, "inr")))
          .for("update").limit(1);
        if (!w) { const e: any = new Error("INR wallet not found for user"); e.code = 500; throw e; }
        const credit = Number(current.amount) - Number(current.fee || 0);
        await tx.update(walletsTable).set({
          balance: sql`${walletsTable.balance} + ${credit}`,
          updatedAt: new Date(),
        }).where(eq(walletsTable.id, w.id));
        await tx.insert(walletLedgerTable).values({
          userId: current.userId, coinId: inrCoin.id, walletType: "inr", type: "deposit_inr",
          amount: credit.toFixed(8),
          balanceBefore: w.balance,
          balanceAfter: (Number(w.balance) + credit).toFixed(8),
          refType: "inr_deposit", refId: String(current.id), note: "INR deposit approved",
        });
      }
      const [d] = await tx.update(inrDepositsTable).set({
        status, notes: notes ?? null, reviewedBy: req.user!.id, processedAt: new Date(),
      }).where(eq(inrDepositsTable.id, id)).returning();
      return d;
    });
    res.json(updated);
    // Check referral signup bonus — deposit may satisfy the deposit condition
    if (status === "completed" && updated) {
      checkAndCreditRegistrationBonus(updated.userId).catch(() => null);
    }
    void logAdminAction(req, { action: `inr_deposit.${status}`, entity: "inr_deposit", entityId: id, payload: { status, notes: notes ?? null } });
    // Fire-and-forget deposit confirmation email
    if (status === "completed" && updated) {
      const [depUser] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1);
      if (depUser?.email) {
        sendDepositEmail(depUser.email, {
          amount: updated.amount,
          currency: "INR",
          method: "INR Bank Transfer",
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    if (e?.code === 404) { res.status(404).json({ error: e.message }); return; }
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/admin/inr-withdrawals", supportPlus, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const q = db.select().from(inrWithdrawalsTable);
  const rows = status
    ? await q.where(eq(inrWithdrawalsTable.status, status)).orderBy(desc(inrWithdrawalsTable.createdAt)).limit(500)
    : await q.orderBy(desc(inrWithdrawalsTable.createdAt)).limit(500);
  res.json(rows);
});
router.patch("/admin/inr-withdrawals/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, rejectReason } = req.body ?? {};
  if (!["completed", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(inrWithdrawalsTable).where(eq(inrWithdrawalsTable.id, id)).for("update").limit(1);
      if (!current) { const e: any = new Error("Not found"); e.code = 404; throw e; }
      if (current.status === status) return current;
      if (current.status !== "pending") {
        const e: any = new Error("Can only update pending withdrawals"); e.code = 400; throw e;
      }
      const [inrCoin] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, current.userId), eq(walletsTable.coinId, inrCoin!.id), eq(walletsTable.walletType, "inr")))
        .for("update").limit(1);
      if (!w) { const e: any = new Error("INR wallet not found"); e.code = 500; throw e; }
      const amt = Number(current.amount);
      // Guarded locked decrement: never push locked negative.
      if (status === "completed") {
        const upd = await tx.update(walletsTable).set({
          locked: sql`${walletsTable.locked} - ${amt}`,
          updatedAt: new Date(),
        }).where(and(eq(walletsTable.id, w.id), sql`${walletsTable.locked} >= ${amt}`)).returning();
        if (upd.length === 0) { const e: any = new Error("Locked balance mismatch — refusing to settle"); e.code = 409; throw e; }
      } else if (status === "rejected") {
        const upd = await tx.update(walletsTable).set({
          locked: sql`${walletsTable.locked} - ${amt}`,
          balance: sql`${walletsTable.balance} + ${amt}`,
          updatedAt: new Date(),
        }).where(and(eq(walletsTable.id, w.id), sql`${walletsTable.locked} >= ${amt}`)).returning();
        if (upd.length === 0) { const e: any = new Error("Locked balance mismatch — refusing to refund"); e.code = 409; throw e; }
        await tx.insert(walletLedgerTable).values({
          userId: current.userId, coinId: inrCoin!.id, walletType: "inr", type: "admin_credit",
          amount: amt.toFixed(8),
          balanceBefore: w.balance,
          balanceAfter: (Number(w.balance) + amt).toFixed(8),
          refType: "inr_withdrawal", refId: String(id), note: "INR withdrawal rejected — refunded",
        });
      }
      const [updatedRow] = await tx.update(inrWithdrawalsTable).set({
        status, rejectReason: rejectReason ?? null, reviewedBy: req.user!.id, processedAt: new Date(),
      }).where(eq(inrWithdrawalsTable.id, id)).returning();
      return updatedRow;
    });
    res.json(updated);
    void logAdminAction(req, { action: `inr_withdrawal.${status}`, entity: "inr_withdrawal", entityId: id, payload: { status, rejectReason: rejectReason ?? null } });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/admin/crypto-deposits", supportPlus, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const detectedBy = typeof req.query.detectedBy === "string" ? req.query.detectedBy : null;
  const conds: any[] = [];
  if (status) conds.push(eq(cryptoDepositsTable.status, status));
  if (detectedBy) conds.push(eq(cryptoDepositsTable.detectedBy, detectedBy));
  const q = db.select().from(cryptoDepositsTable);
  const rows = conds.length
    ? await q.where(and(...conds)).orderBy(desc(cryptoDepositsTable.createdAt)).limit(500)
    : await q.orderBy(desc(cryptoDepositsTable.createdAt)).limit(500);
  res.json(rows);
});

router.get("/admin/crypto-deposits/stats", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select({
    status: cryptoDepositsTable.status,
    detectedBy: cryptoDepositsTable.detectedBy,
    count: sql<number>`count(*)::int`,
    sum: sql<string>`coalesce(sum(${cryptoDepositsTable.amount}), 0)::text`,
  }).from(cryptoDepositsTable).groupBy(cryptoDepositsTable.status, cryptoDepositsTable.detectedBy);
  let total = 0, pending = 0, completed = 0, rejected = 0, autoDetected = 0, manualCount = 0;
  let totalAmount = 0, pendingAmount = 0;
  for (const r of rows) {
    total += r.count;
    if (r.status === "pending") { pending += r.count; pendingAmount += Number(r.sum); }
    else if (r.status === "completed") { completed += r.count; totalAmount += Number(r.sum); }
    else if (r.status === "rejected") rejected += r.count;
    if (r.detectedBy === "sweeper") autoDetected += r.count;
    else manualCount += r.count;
  }
  res.json({ total, pending, completed, rejected, autoDetected, manual: manualCount, totalAmount, pendingAmount });
});

// ─── Admin Vault (password to reveal private keys) ─────────────────────────
router.get("/admin/vault/status", supportPlus, async (_req, res): Promise<void> => {
  res.json({
    passwordSet: await isVaultPasswordSet(),
    mnemonicConfigured: await isMnemonicConfigured(),
  });
});
router.post("/admin/vault/set-password", adminOnly, async (req, res): Promise<void> => {
  const { password, currentPassword } = req.body ?? {};
  if (!password || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  if (await isVaultPasswordSet()) {
    if (!currentPassword || !(await verifyVaultPassword(currentPassword))) {
      res.status(401).json({ error: "Current vault password is incorrect" }); return;
    }
  }
  await setVaultPassword(password);
  res.json({ ok: true });
});
router.post("/admin/vault/verify", adminOnly, async (req, res): Promise<void> => {
  const { password } = req.body ?? {};
  const ok = await verifyVaultPassword(password);
  if (!ok) { res.status(401).json({ error: "Invalid vault password" }); return; }
  res.json({ ok: true });
});
router.post("/admin/vault/reveal-mnemonic", adminOnly, async (req, res): Promise<void> => {
  const { password } = req.body ?? {};
  if (!(await verifyVaultPassword(password))) { res.status(401).json({ error: "Invalid vault password" }); return; }
  res.json({ mnemonic: await getMnemonicForReveal() });
});

// ─── User Wallet Addresses (admin view) ─────────────────────────────────────
router.get("/admin/user-addresses", supportPlus, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const networkId = req.query.networkId ? Number(req.query.networkId) : null;
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));

  const conds = [] as any[];
  if (status === "active" || status === "disabled") conds.push(eq(walletAddressesTable.status, status));
  if (networkId && Number.isFinite(networkId)) conds.push(eq(walletAddressesTable.networkId, networkId));
  if (search) {
    const like = `%${search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const asNum = Number(search);
    const userIdMatch = Number.isFinite(asNum) && Number.isInteger(asNum) ? eq(walletAddressesTable.userId, asNum) : null;
    const orParts = [
      sql`${walletAddressesTable.address} ILIKE ${like}`,
      sql`${usersTable.email} ILIKE ${like}`,
      sql`${usersTable.name} ILIKE ${like}`,
      sql`${usersTable.phone} ILIKE ${like}`,
    ];
    if (userIdMatch) orParts.push(userIdMatch as any);
    conds.push(or(...orParts) as any);
  }

  const rows = await db.select({
    id: walletAddressesTable.id,
    userId: walletAddressesTable.userId,
    networkId: walletAddressesTable.networkId,
    address: walletAddressesTable.address,
    memo: walletAddressesTable.memo,
    status: walletAddressesTable.status,
    derivationPath: walletAddressesTable.derivationPath,
    derivationIndex: walletAddressesTable.derivationIndex,
    hasPrivateKey: sql<boolean>`(${walletAddressesTable.privateKeyEnc} is not null)`,
    createdAt: walletAddressesTable.createdAt,
    lastUsedAt: walletAddressesTable.lastUsedAt,
    userEmail: usersTable.email,
    userName: usersTable.name,
    userPhone: usersTable.phone,
  })
  .from(walletAddressesTable)
  .leftJoin(usersTable, eq(usersTable.id, walletAddressesTable.userId))
  .where(conds.length ? (and(...conds) as any) : undefined as any)
  .orderBy(desc(walletAddressesTable.createdAt))
  .limit(limit);

  res.json(rows);
});

router.get("/admin/user-addresses/stats", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select({
    status: walletAddressesTable.status,
    networkId: walletAddressesTable.networkId,
    count: sql<number>`count(*)::int`,
    withPk: sql<number>`count(*) filter (where ${walletAddressesTable.privateKeyEnc} is not null)::int`,
  }).from(walletAddressesTable).groupBy(walletAddressesTable.status, walletAddressesTable.networkId);
  let total = 0, active = 0, disabled = 0, withPk = 0, withoutPk = 0;
  const perNetwork: Record<number, { total: number; withPk: number }> = {};
  for (const r of rows) {
    total += r.count;
    if (r.status === "active") active += r.count;
    else if (r.status === "disabled") disabled += r.count;
    withPk += r.withPk;
    withoutPk += r.count - r.withPk;
    if (!perNetwork[r.networkId]) perNetwork[r.networkId] = { total: 0, withPk: 0 };
    perNetwork[r.networkId].total += r.count;
    perNetwork[r.networkId].withPk += r.withPk;
  }
  res.json({ total, active, disabled, withPk, withoutPk, perNetwork });
});

router.patch("/admin/user-addresses/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status } = req.body ?? {};
  if (!["active", "disabled"].includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const [updated] = await db.update(walletAddressesTable).set({ status })
    .where(eq(walletAddressesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.post("/admin/user-addresses/:id/reveal", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { password } = req.body ?? {};
  if (!password) { res.status(400).json({ error: "Password required" }); return; }
  if (!(await verifyVaultPassword(password))) { res.status(401).json({ error: "Invalid vault password" }); return; }
  const [row] = await db.select().from(walletAddressesTable).where(eq(walletAddressesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Address not found" }); return; }
  if (!row.privateKeyEnc) { res.status(400).json({ error: "No private key stored for this address" }); return; }
  const pk = decryptSecret(row.privateKeyEnc);
  if (!pk) { res.status(500).json({ error: "Decryption failed" }); return; }
  res.json({ id: row.id, address: row.address, privateKey: pk, derivationPath: row.derivationPath });
});

// Deposit Sweeper status & control
router.get("/admin/sweeper/status", supportPlus, async (_req, res): Promise<void> => {
  res.json(getSweeperStatus());
});
router.post("/admin/sweeper/start", adminOnly, async (req, res): Promise<void> => {
  const intervalMs = Number(req.body?.intervalMs) || 30000;
  startDepositSweeper(intervalMs);
  res.json({ ok: true, ...getSweeperStatus() });
});
router.post("/admin/sweeper/stop", adminOnly, async (_req, res): Promise<void> => {
  stopDepositSweeper();
  res.json({ ok: true, ...getSweeperStatus() });
});
router.post("/admin/sweeper/scan", adminOnly, async (_req, res): Promise<void> => {
  const results = await sweepAllNetworks();
  res.json({ ok: true, results });
});
// Auto-sweep stats (deposit queue pending→master wallet)
router.get("/admin/sweeper/auto-sweep-stats", supportPlus, async (_req, res): Promise<void> => {
  res.json(await getAutoSweepStats());
});

// Manually trigger auto-sweep for a specific confirmed deposit
router.post("/admin/crypto-deposits/:id/sweep", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad deposit id" }); return; }
  const [dep] = await db.select().from(cryptoDepositsTable).where(eq(cryptoDepositsTable.id, id)).limit(1);
  if (!dep) { res.status(404).json({ error: "Deposit not found" }); return; }
  if (dep.status !== "completed") {
    res.status(400).json({ error: "Can only sweep completed (credited) deposits" }); return;
  }
  // Allow re-queuing failed sweeps too
  if (dep.sweepStatus && dep.sweepStatus !== "failed" && dep.sweepStatus !== "pending") {
    res.status(409).json({ error: `Deposit already in sweep state: ${dep.sweepStatus}` }); return;
  }
  // Set/reset to pending so sweepDepositToMaster can claim it
  await db.update(cryptoDepositsTable).set({ sweepStatus: "pending" }).where(eq(cryptoDepositsTable.id, id));
  const result = await sweepDepositToMaster(id);
  await logAdminAction(req, { action: "manual_sweep", entity: "deposit", entityId: id, payload: { result } });
  res.json({ ok: result.status === "swept", ...result });
});

router.post("/admin/sweeper/scan/:networkId", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.networkId) ? req.params.networkId[0] : req.params.networkId);
  if (!id) { res.status(400).json({ error: "Invalid network id" }); return; }
  const result = await manualScan(id);
  res.json({ ok: true, result });
});
router.patch("/admin/crypto-deposits/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, confirmations } = req.body ?? {};
  if (!["completed", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(cryptoDepositsTable).where(eq(cryptoDepositsTable.id, id)).for("update").limit(1);
      if (!current) { const e: any = new Error("Not found"); e.code = 404; throw e; }
      if (current.status === status) return current;
      if (current.status !== "pending") {
        const e: any = new Error("Can only transition pending deposits"); e.code = 400; throw e;
      }
      // Credit on completion — atomic upsert keyed on the (userId, walletType, coinId) unique index
      if (status === "completed") {
        const amt = Number(current.amount);
        const [existingWallet] = await tx.select({ balance: walletsTable.balance }).from(walletsTable)
          .where(and(eq(walletsTable.userId, current.userId), eq(walletsTable.coinId, current.coinId), eq(walletsTable.walletType, "spot")))
          .limit(1);
        const cryptoBalBefore = existingWallet?.balance ?? "0";
        await tx.insert(walletsTable).values({
          userId: current.userId, coinId: current.coinId, walletType: "spot",
          balance: String(amt), locked: "0",
        }).onConflictDoUpdate({
          target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
          set: { balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date() },
        });
        await tx.insert(walletLedgerTable).values({
          userId: current.userId, coinId: current.coinId, walletType: "spot", type: "deposit_crypto",
          amount: amt.toFixed(8),
          balanceBefore: cryptoBalBefore,
          balanceAfter: (Number(cryptoBalBefore) + amt).toFixed(8),
          refType: "crypto_deposit", refId: String(current.id), note: "Crypto deposit approved",
        });
      }
      const [d] = await tx.update(cryptoDepositsTable).set({
        status,
        confirmations: typeof confirmations === "number" ? confirmations : current.confirmations,
        processedAt: new Date(),
      }).where(eq(cryptoDepositsTable.id, id)).returning();
      return d;
    });
    res.json(updated);
    // Check referral signup bonus — deposit may satisfy the deposit condition
    if (status === "completed" && updated) {
      checkAndCreditRegistrationBonus(updated.userId).catch(() => null);
    }
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});
router.post("/admin/users/:id/fund", adminOnly, async (req, res): Promise<void> => {
  const userId = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { coinId: rawCoinId, symbol, amount, walletType: rawWalletType, note } = req.body ?? {};
  if (!userId || Number.isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) { res.status(400).json({ error: "Amount must be > 0" }); return; }
  const walletType = rawWalletType === "inr" ? "inr" : "spot";
  try {
    const result = await db.transaction(async (tx) => {
      const [user] = await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) { const e: any = new Error("User not found"); e.code = 404; throw e; }
      let coinId = Number(rawCoinId);
      if (!Number.isFinite(coinId) || coinId <= 0) {
        if (!symbol) { const e: any = new Error("coinId or symbol required"); e.code = 400; throw e; }
        const [c] = await tx.select().from(coinsTable).where(eq(coinsTable.symbol, String(symbol).toUpperCase())).limit(1);
        if (!c) { const e: any = new Error(`Coin ${symbol} not configured`); e.code = 400; throw e; }
        coinId = c.id;
      } else {
        const [c] = await tx.select().from(coinsTable).where(eq(coinsTable.id, coinId)).limit(1);
        if (!c) { const e: any = new Error("Coin not found"); e.code = 400; throw e; }
      }
      // Snapshot balance before the upsert for ledger tracking
      const [preFundW] = await tx.select({ balance: walletsTable.balance }).from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
        .limit(1);
      const fundBalBefore = preFundW?.balance ?? "0";
      // Atomic upsert — creates wallet if missing, else credits balance
      await tx.insert(walletsTable).values({
        userId, coinId, walletType,
        balance: String(amt), locked: "0",
      }).onConflictDoUpdate({
        target: [walletsTable.userId, walletsTable.walletType, walletsTable.coinId],
        set: { balance: sql`${walletsTable.balance} + ${amt}`, updatedAt: new Date() },
      });
      const [wallet] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, userId), eq(walletsTable.coinId, coinId), eq(walletsTable.walletType, walletType)))
        .limit(1);
      // Ledger entry — recorded in transfers table with synthetic source
      const [ledger] = await tx.insert(transfersTable).values({
        userId, fromWallet: "admin_fund", toWallet: walletType, coinId,
        amount: String(amt), status: "completed",
      }).returning();
      await tx.insert(walletLedgerTable).values({
        userId, coinId, walletType, type: "admin_credit",
        amount: amt.toFixed(8),
        balanceBefore: fundBalBefore,
        balanceAfter: (Number(fundBalBefore) + amt).toFixed(8),
        refType: "admin_fund", refId: String(ledger.id), note: note ?? "Admin manual credit",
      });
      return { wallet, ledger, note: note ?? null, by: req.user!.id };
    });
    res.json(result);
    void logAdminAction(req, {
      action: "user.fund",
      entity: "user", entityId: userId,
      payload: { symbol: symbol ?? null, coinId: rawCoinId ?? null, amount: amt, walletType, note: note ?? null },
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/admin/crypto-withdrawals", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(cryptoWithdrawalsTable).orderBy(desc(cryptoWithdrawalsTable.createdAt)).limit(500));
});
router.get("/admin/crypto-withdrawals/stats", supportPlus, async (_req, res): Promise<void> => {
  const all = await db.select().from(cryptoWithdrawalsTable);
  const since = Date.now() - 24 * 3600 * 1000;
  const pending = all.filter((w) => w.status === "pending");
  const today = all.filter((w) => new Date(w.createdAt).getTime() >= since);
  const completed = all.filter((w) => w.status === "completed");
  const rejected = all.filter((w) => w.status === "rejected");
  const totalLocked = pending.reduce((s, w) => s + Number(w.amount), 0);
  res.json({
    pending: pending.length,
    completed: completed.length,
    rejected: rejected.length,
    today: today.length,
    todayVolume: today.reduce((s, w) => s + Number(w.amount), 0),
    totalLocked,
  });
});
router.post("/admin/crypto-withdrawals/:id/auto-send", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  try {
    const result = await broadcastWithdrawal(id, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BroadcastError) { res.status(e.code).json({ error: e.message }); return; }
    res.status(500).json({ error: (e as Error).message || "Broadcast failed" });
  }
});
router.get("/admin/networks/:id/hot-wallet", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  try {
    const bal = await getHotWalletBalance(id);
    res.json(bal);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
router.get("/admin/networks/auto-send-supported", supportPlus, async (_req, res): Promise<void> => {
  const networks = await db.select().from(networksTable);
  res.json(networks.map((n) => ({
    id: n.id,
    name: n.name,
    chain: n.chain,
    coinId: n.coinId,
    autoSendSupported: isEvmChain(n.chain) && !!n.hotWalletAddress && !!n.hotWalletPrivateKeyEnc && !!n.nodeAddress,
    hotWalletConfigured: !!n.hotWalletAddress && !!n.hotWalletPrivateKeyEnc,
    rpcConfigured: !!n.nodeAddress,
    isEvm: isEvmChain(n.chain),
    minWithdraw: n.minWithdraw,
    withdrawFee: n.withdrawFee,
    withdrawEnabled: n.withdrawEnabled,
    autoWithdrawEnabled: n.autoWithdrawEnabled,
    autoSweepEnabled: n.autoSweepEnabled,
  })));
});

// Auto-withdraw scheduler status
router.get("/admin/auto-withdraw/status", supportPlus, (_req, res): void => {
  res.json(getAutoWithdrawSchedulerStatus());
});
router.patch("/admin/crypto-withdrawals/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const { status, txHash, rejectReason } = req.body ?? {};
  if (!["completed", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.id, id)).for("update").limit(1);
      if (!current) { const e: any = new Error("Not found"); e.code = 404; throw e; }
      if (current.status === status) return current;
      if (current.status !== "pending") {
        const e: any = new Error("Can only update pending withdrawals"); e.code = 400; throw e;
      }
      const [w] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, current.userId), eq(walletsTable.coinId, current.coinId), eq(walletsTable.walletType, "spot")))
        .for("update").limit(1);
      if (!w) { const e: any = new Error("Spot wallet not found"); e.code = 500; throw e; }
      const amt = Number(current.amount);
      // Guarded locked decrement: only succeeds when locked >= amt, so we
      // can never push the locked column negative under anomalous state.
      if (status === "completed") {
        const upd = await tx.update(walletsTable).set({
          locked: sql`${walletsTable.locked} - ${amt}`,
          updatedAt: new Date(),
        }).where(and(eq(walletsTable.id, w.id), sql`${walletsTable.locked} >= ${amt}`)).returning();
        if (upd.length === 0) { const e: any = new Error("Locked balance mismatch — refusing to settle"); e.code = 409; throw e; }
        await tx.insert(walletLedgerTable).values({
          userId: current.userId, coinId: current.coinId, walletType: "spot", type: "withdrawal_crypto",
          amount: (-amt).toFixed(8),
          balanceBefore: String((Number(w.balance) + amt).toFixed(8)),
          balanceAfter: w.balance,
          refType: "crypto_withdrawal", refId: String(id), note: "Crypto withdrawal completed",
        });
      } else if (status === "rejected") {
        const upd = await tx.update(walletsTable).set({
          locked: sql`${walletsTable.locked} - ${amt}`,
          balance: sql`${walletsTable.balance} + ${amt}`,
          updatedAt: new Date(),
        }).where(and(eq(walletsTable.id, w.id), sql`${walletsTable.locked} >= ${amt}`)).returning();
        if (upd.length === 0) { const e: any = new Error("Locked balance mismatch — refusing to refund"); e.code = 409; throw e; }
        await tx.insert(walletLedgerTable).values({
          userId: current.userId, coinId: current.coinId, walletType: "spot", type: "admin_credit",
          amount: amt.toFixed(8),
          balanceBefore: w.balance,
          balanceAfter: (Number(w.balance) + amt).toFixed(8),
          refType: "crypto_withdrawal", refId: String(id), note: "Crypto withdrawal rejected — refunded",
        });
      }
      const [updatedRow] = await tx.update(cryptoWithdrawalsTable).set({
        status, txHash: txHash ?? null, rejectReason: rejectReason ?? null,
        reviewedBy: req.user!.id, processedAt: new Date(),
      }).where(eq(cryptoWithdrawalsTable.id, id)).returning();
      return updatedRow;
    });
    void logAdminAction(req, {
      action: `crypto_withdrawal.${status}`,
      entity: "crypto_withdrawal",
      entityId: id,
      payload: { status, txHash: txHash ?? null, rejectReason: rejectReason ?? null },
    });
    res.json(updated);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

// Earn products
function pickEarnFields(b: Record<string, unknown>, isCreate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const setStr = (k: string, v: unknown) => { if (v !== undefined && v !== null) out[k] = String(v); };
  const setNum = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== "") out[k] = Number(v); };
  const setBool = (k: string, v: unknown) => { if (v !== undefined) out[k] = Boolean(v); };
  const setDate = (k: string, v: unknown) => {
    if (v === null || v === "") { out[k] = null; return; }
    if (v !== undefined) { const d = new Date(String(v)); if (!Number.isNaN(d.getTime())) out[k] = d; }
  };
  if (isCreate) setNum("coinId", b.coinId);
  if (b.type !== undefined) {
    const t = String(b.type);
    if (!["simple", "advanced"].includes(t)) throw new Error("Invalid type");
    out.type = t;
  }
  if (b.payoutInterval !== undefined && !["daily", "weekly", "monthly", "atMaturity"].includes(String(b.payoutInterval))) {
    throw new Error("Invalid payoutInterval");
  }
  if (b.status !== undefined && !["active", "paused", "ended"].includes(String(b.status))) {
    throw new Error("Invalid status");
  }
  setStr("name", b.name);
  setStr("description", b.description);
  setNum("durationDays", b.durationDays);
  setStr("apy", b.apy);
  setStr("minAmount", b.minAmount);
  setStr("maxAmount", b.maxAmount);
  setStr("totalCap", b.totalCap);
  setStr("payoutInterval", b.payoutInterval);
  setBool("compounding", b.compounding);
  setBool("earlyRedemption", b.earlyRedemption);
  setStr("earlyRedemptionPenaltyPct", b.earlyRedemptionPenaltyPct);
  setNum("minVipTier", b.minVipTier);
  setBool("featured", b.featured);
  setNum("displayOrder", b.displayOrder);
  setDate("saleStartAt", b.saleStartAt);
  setDate("saleEndAt", b.saleEndAt);
  if (b.status !== undefined) out.status = String(b.status);
  return out;
}
router.get("/admin/earn-products", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(earnProductsTable).orderBy(desc(earnProductsTable.displayOrder), desc(earnProductsTable.createdAt)));
});
router.post("/admin/earn-products", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.coinId || !b.type || b.apy === undefined) {
    res.status(400).json({ error: "coinId, type, apy required" }); return;
  }
  let fields: Record<string, unknown>;
  try { fields = pickEarnFields(b, true); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  const [p] = await db.insert(earnProductsTable).values(fields as typeof earnProductsTable.$inferInsert).returning();
  res.status(201).json(p);
});
router.patch("/admin/earn-products/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  let fields: Record<string, unknown>;
  try { fields = pickEarnFields(req.body ?? {}, false); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  if (Object.keys(fields).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [p] = await db.update(earnProductsTable).set(fields).where(eq(earnProductsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(p);
});
router.delete("/admin/earn-products/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(earnProductsTable).where(eq(earnProductsTable.id, id));
  res.sendStatus(204);
});
router.get("/admin/earn-positions", supportPlus, async (_req, res): Promise<void> => {
  // Join with users for email + product for coin/APY context
  const rows = await db
    .select({
      id: earnPositionsTable.id,
      userId: earnPositionsTable.userId,
      productId: earnPositionsTable.productId,
      amount: earnPositionsTable.amount,
      totalEarned: earnPositionsTable.totalEarned,
      autoMaturity: earnPositionsTable.autoMaturity,
      status: earnPositionsTable.status,
      startedAt: earnPositionsTable.startedAt,
      maturedAt: earnPositionsTable.maturedAt,
      closedAt: earnPositionsTable.closedAt,
      userEmail: usersTable.email,
      userName: usersTable.name,
      coinSymbol: coinsTable.symbol,
      productName: earnProductsTable.name,
      apy: earnProductsTable.apy,
    })
    .from(earnPositionsTable)
    .leftJoin(usersTable, eq(earnPositionsTable.userId, usersTable.id))
    .innerJoin(earnProductsTable, eq(earnPositionsTable.productId, earnProductsTable.id))
    .innerJoin(coinsTable, eq(earnProductsTable.coinId, coinsTable.id))
    .orderBy(desc(earnPositionsTable.startedAt))
    .limit(500);
  res.json(rows);
});

router.post("/admin/earn-positions/:id/force-redeem", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [pos] = await tx.select().from(earnPositionsTable)
        .where(eq(earnPositionsTable.id, id)).for("update").limit(1);
      if (!pos) { const e: any = new Error("Position not found"); e.code = 404; throw e; }
      if (pos.status !== "active" && pos.status !== "matured") {
        const e: any = new Error(`Cannot force-redeem — status is ${pos.status}`); e.code = 400; throw e;
      }
      const [p] = await tx.select().from(earnProductsTable).where(eq(earnProductsTable.id, pos.productId)).limit(1);
      if (!p) { const e: any = new Error("Product missing"); e.code = 500; throw e; }

      const principal = Number(pos.amount);
      const apy = Number(p.apy) / 100;
      const elapsedDays = (Date.now() - pos.startedAt.getTime()) / 86400_000;
      const earned = principal * apy * elapsedDays / 365;
      const payout = principal + Math.max(0, earned);

      // Release earn locked
      await tx.update(walletsTable).set({
        locked: sql`GREATEST(0, ${walletsTable.locked} - ${principal})`, updatedAt: new Date(),
      }).where(and(eq(walletsTable.userId, pos.userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "earn")));

      // Credit spot wallet
      const [spot] = await tx.select().from(walletsTable)
        .where(and(eq(walletsTable.userId, pos.userId), eq(walletsTable.coinId, p.coinId), eq(walletsTable.walletType, "spot")))
        .for("update").limit(1);
      const earnSpotBalBefore = spot?.balance ?? "0";
      if (spot) {
        await tx.update(walletsTable).set({ balance: sql`${walletsTable.balance} + ${payout}`, updatedAt: new Date() }).where(eq(walletsTable.id, spot.id));
      } else {
        await tx.insert(walletsTable).values({ userId: pos.userId, coinId: p.coinId, walletType: "spot", balance: String(payout.toFixed(8)), locked: "0" });
      }
      const earnedClamped = Math.max(0, earned);
      await tx.insert(walletLedgerTable).values([
        {
          userId: pos.userId, coinId: p.coinId, walletType: "spot", type: "earn_withdrawal",
          amount: principal.toFixed(8),
          balanceBefore: earnSpotBalBefore,
          balanceAfter: (Number(earnSpotBalBefore) + principal).toFixed(8),
          refType: "earn_position", refId: String(id), note: "Earn principal returned (force-redeem)",
        },
        {
          userId: pos.userId, coinId: p.coinId, walletType: "spot", type: "earn_interest",
          amount: earnedClamped.toFixed(8),
          balanceBefore: (Number(earnSpotBalBefore) + principal).toFixed(8),
          balanceAfter: (Number(earnSpotBalBefore) + payout).toFixed(8),
          refType: "earn_position", refId: String(id), note: "Earn interest credited (force-redeem)",
        },
      ]);

      // Update product subscribed
      await tx.update(earnProductsTable).set({
        currentSubscribed: sql`GREATEST(0, ${earnProductsTable.currentSubscribed} - ${principal})`,
      }).where(eq(earnProductsTable.id, p.id));

      const [updated] = await tx.update(earnPositionsTable).set({
        status: "redeemed", totalEarned: String(Math.max(0, earned).toFixed(8)), closedAt: new Date(),
      }).where(eq(earnPositionsTable.id, id)).returning();

      await logAdminAction(req, { action: "earn.force_redeem", entity: "earn_positions", entityId: id, payload: { userId: pos.userId, payout: payout.toFixed(8) } });
      return { ...updated, payout, earned };
    });
    res.json(result);
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.get("/admin/earn-stats", supportPlus, async (_req, res): Promise<void> => {
  const products = await db.select().from(earnProductsTable);
  const positions = await db.select().from(earnPositionsTable);
  const now = Date.now();
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.status === "active").length;
  const totalCap = products.reduce((s, p) => s + Number(p.totalCap || 0), 0);
  const totalSubscribed = products.reduce((s, p) => s + Number(p.currentSubscribed || 0), 0);
  const activePos = positions.filter((p) => p.status === "active");
  const activePositions = activePos.length;
  const totalPositionAmount = activePos.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalEarned = positions.reduce((s, p) => s + Number(p.totalEarned || 0), 0);
  const maturedPending = positions.filter((p) => p.status === "matured").length;
  const autoRenewCount = activePos.filter((p) => p.autoMaturity).length;
  // Live pending yield across all active positions (client-calc from startedAt)
  const { getEarnEngineStatus } = await import("../lib/earn-engine");
  const engineStatus = getEarnEngineStatus();
  res.json({
    totalProducts, activeProducts, totalCap, totalSubscribed,
    activePositions, totalPositionAmount, totalEarned,
    maturedPending, autoRenewCount, engineStatus,
  });
});

router.post("/admin/earn-engine/run", adminOnly, async (_req, res): Promise<void> => {
  const { runEarnEngineTick } = await import("../lib/earn-engine");
  void runEarnEngineTick();
  res.json({ ok: true, message: "Earn engine tick triggered" });
});

// Legal CMS
router.get("/admin/legal", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(legalPagesTable));
});
router.put("/admin/legal/:slug", adminOnly, async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  const { title, content } = req.body ?? {};
  if (!slug || !title) { res.status(400).json({ error: "slug & title required" }); return; }
  const existing = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
  if (existing.length === 0) {
    const [p] = await db.insert(legalPagesTable).values({ slug, title, content: content ?? "", updatedBy: req.user!.id }).returning();
    res.status(201).json(p); return;
  }
  const [p] = await db.update(legalPagesTable).set({ title, content: content ?? "", updatedBy: req.user!.id }).where(eq(legalPagesTable.slug, slug)).returning();
  res.json(p);
});

// Settings
router.get("/admin/settings", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(settingsTable));
});
router.put("/admin/settings/:key", adminOnly, async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const { value } = req.body ?? {};
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const v = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  if (existing.length === 0) {
    const [s] = await db.insert(settingsTable).values({ key, value: v }).returning();
    res.status(201).json(s); return;
  }
  const [s] = await db.update(settingsTable).set({ value: v }).where(eq(settingsTable.key, key)).returning();
  res.json(s);
});

// OTP providers
router.get("/admin/otp-providers", adminOnly, async (_req, res): Promise<void> => {
  res.json(await db.select().from(otpProvidersTable));
});
router.post("/admin/otp-providers", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.channel || !b.provider) { res.status(400).json({ error: "channel & provider required" }); return; }
  const [p] = await db.insert(otpProvidersTable).values({
    channel: b.channel, provider: b.provider, apiKey: b.apiKey ?? null, apiSecret: b.apiSecret ?? null,
    senderId: b.senderId ?? null, template: b.template ?? null, isActive: b.isActive ?? false,
  }).returning();
  res.status(201).json(p);
});
router.patch("/admin/otp-providers/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [p] = await db.update(otpProvidersTable).set(req.body).where(eq(otpProvidersTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(p);
});
router.delete("/admin/otp-providers/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(otpProvidersTable).where(eq(otpProvidersTable.id, id));
  res.sendStatus(204);
});

// Login logs
router.get("/admin/login-logs", adminOnly, async (_req, res): Promise<void> => {
  res.json(await db.select().from(loginLogsTable).orderBy(desc(loginLogsTable.createdAt)).limit(500));
});

// Chat
router.get("/admin/chat-threads", supportPlus, async (_req, res): Promise<void> => {
  res.json(await db.select().from(chatThreadsTable).orderBy(desc(chatThreadsTable.lastMessageAt)).limit(200));
});
router.get("/admin/chat-threads/:id/messages", supportPlus, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  res.json(await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.threadId, id)).orderBy(chatMessagesTable.createdAt));
});
router.post("/admin/chat-threads/:id/messages", supportPlus, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const message = String(req.body?.message ?? "").trim();
  if (!message) { res.status(400).json({ error: "message required" }); return; }
  const [m] = await db.insert(chatMessagesTable).values({
    threadId: id, senderId: req.user!.id, senderRole: "support", message,
  }).returning();
  await db.update(chatThreadsTable).set({ lastMessageAt: new Date(), assigneeId: req.user!.id }).where(eq(chatThreadsTable.id, id));
  res.status(201).json(m);
});
router.patch("/admin/chat-threads/:id", supportPlus, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [t] = await db.update(chatThreadsTable).set(req.body).where(eq(chatThreadsTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found" }); return; }
  res.json(t);
});

// Email configs
router.get("/admin/email-configs", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(emailConfigsTable).orderBy(desc(emailConfigsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, password: r.password ? "••••••••" : null, apiKey: r.apiKey ? "••••••••" : null, _passwordSet: !!r.password, _apiKeySet: !!r.apiKey })));
});
router.post("/admin/email-configs", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.name || !b.provider) { res.status(400).json({ error: "name & provider required" }); return; }
  const [row] = await db.insert(emailConfigsTable).values({
    name: b.name, provider: b.provider, smtpHost: b.smtpHost ?? null, smtpPort: b.smtpPort ?? 587,
    smtpSecure: b.smtpSecure ?? false, username: b.username ?? null, password: b.password ?? null,
    fromEmail: b.fromEmail ?? null, fromName: b.fromName ?? null,
    apiKey: b.apiKey ?? null, domain: b.domain ?? null, region: b.region ?? "us-east-1",
    isActive: b.isActive ?? false,
  }).returning();
  res.status(201).json({ ...row, password: undefined, apiKey: undefined });
});
router.patch("/admin/email-configs/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const b = req.body ?? {};
  const upd: Record<string, any> = {};
  for (const k of ["name","provider","smtpHost","smtpPort","smtpSecure","username","fromEmail","fromName","domain","region","isActive","testStatus"]) {
    if (b[k] !== undefined) upd[k] = b[k];
  }
  if (b.password && b.password !== "••••••••") upd.password = b.password;
  if (b.apiKey && b.apiKey !== "••••••••") upd.apiKey = b.apiKey;
  const [row] = await db.update(emailConfigsTable).set(upd).where(eq(emailConfigsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, password: undefined, apiKey: undefined });
});
router.delete("/admin/email-configs/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(emailConfigsTable).where(eq(emailConfigsTable.id, id));
  res.sendStatus(204);
});
router.post("/admin/email-configs/:id/test", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [cfg] = await db.select().from(emailConfigsTable).where(eq(emailConfigsTable.id, id)).limit(1);
  if (!cfg) { res.status(404).json({ error: "Not found" }); return; }
  // Simulated test — in production, use nodemailer/sendgrid SDK
  const ok = !!(cfg.smtpHost || cfg.apiKey);
  await db.update(emailConfigsTable).set({ testStatus: ok ? "ok" : "failed", lastTestedAt: new Date() }).where(eq(emailConfigsTable.id, id));
  res.json({ ok, message: ok ? `Config looks valid (${cfg.provider})` : "Missing credentials" });
});

// Custom APIs
router.get("/admin/custom-apis", adminOnly, async (_req, res): Promise<void> => {
  res.json(await db.select().from(customApisTable).orderBy(desc(customApisTable.createdAt)));
});
router.post("/admin/custom-apis", adminOnly, async (req, res): Promise<void> => {
  const b = req.body ?? {};
  if (!b.name || !b.endpointUrl) { res.status(400).json({ error: "name & endpointUrl required" }); return; }
  const [row] = await db.insert(customApisTable).values({
    name: b.name, description: b.description ?? null, category: b.category ?? "webhook",
    endpointUrl: b.endpointUrl, method: b.method ?? "POST",
    authType: b.authType ?? "none", authValue: b.authValue ?? null,
    headers: b.headers ?? "{}", isActive: b.isActive ?? false,
  }).returning();
  res.status(201).json(row);
});
router.patch("/admin/custom-apis/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const allowed = ["name","description","category","endpointUrl","method","authType","authValue","headers","isActive","lastStatus"];
  const upd: Record<string, any> = {};
  for (const k of allowed) if (req.body[k] !== undefined) upd[k] = req.body[k];
  const [row] = await db.update(customApisTable).set(upd).where(eq(customApisTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});
router.delete("/admin/custom-apis/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  await db.delete(customApisTable).where(eq(customApisTable.id, id));
  res.sendStatus(204);
});
router.post("/admin/custom-apis/:id/test", adminOnly, async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const [api] = await db.select().from(customApisTable).where(eq(customApisTable.id, id)).limit(1);
  if (!api) { res.status(404).json({ error: "Not found" }); return; }
  try {
    const hdrs: Record<string, string> = { "Content-Type": "application/json", "X-Source": "Zebvix-Admin" };
    const parsed = JSON.parse(api.headers || "{}");
    Object.assign(hdrs, parsed);
    if (api.authType === "bearer" && api.authValue) hdrs["Authorization"] = `Bearer ${api.authValue}`;
    if (api.authType === "basic" && api.authValue) hdrs["Authorization"] = `Basic ${Buffer.from(api.authValue).toString("base64")}`;
    const t0 = Date.now();
    const r = await fetch(api.endpointUrl, { method: api.method, headers: hdrs, body: api.method !== "GET" ? JSON.stringify({ ping: true }) : undefined, signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - t0;
    const ok = r.status < 500;
    await db.update(customApisTable).set({ lastStatus: ok ? "ok" : "error", lastCalledAt: new Date() }).where(eq(customApisTable.id, id));
    res.json({ ok, status: r.status, latencyMs });
  } catch (e: any) {
    await db.update(customApisTable).set({ lastStatus: "error", lastCalledAt: new Date() }).where(eq(customApisTable.id, id));
    res.json({ ok: false, error: e.message });
  }
});

// ─── TDS Report ─────────────────────────────────────────────────────────────
router.get("/admin/tds-report", supportPlus, async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400000);
  const to = q.to ? new Date(q.to) : new Date();

  // Summary stats — real user orders only (is_bot = 0)
  const [summary] = await db.execute(sql`
    SELECT
      COALESCE(SUM(tds), 0)::text AS total_tds,
      COUNT(*) AS total_trades,
      COUNT(DISTINCT user_id) AS unique_sellers
    FROM orders
    WHERE side = 'sell' AND tds > 0 AND is_bot = 0
      AND created_at >= ${from} AND created_at <= ${to}
  `).then((r: any) => r.rows ?? r);

  // Per-user breakdown — real user orders only
  const perUser = await db.execute(sql`
    SELECT
      o.user_id,
      u.name, u.email, u.phone,
      SUM(o.tds)::text AS tds_collected,
      SUM(o.avg_price * o.filled_qty)::text AS gross_sell_value,
      COUNT(*) AS trade_count,
      MAX(o.created_at) AS last_trade_at
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.side = 'sell' AND o.tds > 0 AND o.is_bot = 0
      AND o.created_at >= ${from} AND o.created_at <= ${to}
    GROUP BY o.user_id, u.name, u.email, u.phone
    ORDER BY SUM(o.tds) DESC
    LIMIT 200
  `).then((r: any) => r.rows ?? r);

  // Daily trend — real user orders only
  const daily = await db.execute(sql`
    SELECT
      DATE(created_at) AS day,
      SUM(tds)::text AS tds,
      COUNT(*) AS trades
    FROM orders
    WHERE side = 'sell' AND tds > 0 AND is_bot = 0
      AND created_at >= ${from} AND created_at <= ${to}
    GROUP BY DATE(created_at)
    ORDER BY day
  `).then((r: any) => r.rows ?? r);

  res.json({ summary, perUser, daily, period: { from, to } });
});

// ─── Push Notifications (FCM broadcast) ─────────────────────────────────────
router.get("/admin/push/device-tokens", adminOnly, async (req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT dt.id, dt.user_id, u.name, u.email, dt.platform, dt.is_active, dt.last_seen_at, dt.created_at
    FROM device_tokens dt
    LEFT JOIN users u ON u.id = dt.user_id
    ORDER BY dt.last_seen_at DESC LIMIT 500
  `).then((r: any) => r.rows ?? r);
  res.json(rows);
});

router.get("/admin/push/stats", adminOnly, async (_req, res): Promise<void> => {
  const [stats] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE is_active) AS active_tokens,
      COUNT(*) AS total_tokens,
      COUNT(DISTINCT user_id) FILTER (WHERE is_active) AS registered_users,
      COUNT(*) FILTER (WHERE platform = 'web' AND is_active) AS web_tokens,
      COUNT(*) FILTER (WHERE platform = 'android' AND is_active) AS android_tokens,
      COUNT(*) FILTER (WHERE platform = 'ios' AND is_active) AS ios_tokens
    FROM device_tokens
  `).then((r: any) => r.rows ?? r);
  res.json(stats ?? {});
});

router.post("/admin/push/broadcast", adminOnly, async (req, res): Promise<void> => {
  const { title, body, imageUrl, platform, data } = req.body ?? {};
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }
  const result = await broadcastPush({ title, body, imageUrl, data }, { platform });
  await logAdminAction(req, { action: "push_broadcast", entity: "push", payload: { title, body, ...result } });
  res.json(result);
});

router.post("/admin/push/send-to-user/:userId", adminOnly, async (req, res): Promise<void> => {
  const userId = Number(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId);
  const { title, body, imageUrl } = req.body ?? {};
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }
  const { sendPushToUser } = await import("../lib/push");
  const result = await sendPushToUser(userId, { title, body, imageUrl });
  res.json(result);
});

void and;
export default router;
