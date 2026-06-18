import { Router, type IRouter } from "express";
import { eq, desc, or, ilike, and, sql } from "drizzle-orm";
import {
  db, coinsTable, pairsTable, fundingRatesTable, adminApiKeysTable,
  usersTable, kycRecordsTable, walletsTable, sessionsTable,
  inrDepositsTable, cryptoDepositsTable, inrWithdrawalsTable, cryptoWithdrawalsTable,
  futuresPositionsTable, loginLogsTable, ordersTable,
} from "@workspace/db";
void sql;
import { requireAuth } from "../middlewares/auth";
import { getCache, getInrRate } from "../lib/price-service";

const router: IRouter = Router();

const supportPlus = (req: any, res: any, next: any) => {
  if (!req.user) return res.sendStatus(401);
  if (!["support", "admin", "superadmin"].includes(req.user.role)) return res.sendStatus(403);
  next();
};
const adminOnly = (req: any, res: any, next: any) => {
  if (!req.user) return res.sendStatus(401);
  if (!["admin", "superadmin"].includes(req.user.role)) return res.sendStatus(403);
  next();
};

// ─── Public live prices ───────────────────────────────────────────────────────
router.get("/prices", (_req, res) => {
  res.json({ inrRate: getInrRate(), ticks: getCache() });
});

// ─── Admin: search users ──────────────────────────────────────────────────────
router.get("/admin/users-search", requireAuth, supportPlus, async (req, res): Promise<void> => {
  const q = (req.query.q as string) || "";
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const conds: any[] = [];
  if (q) conds.push(or(ilike(usersTable.email, `%${q}%`), ilike(usersTable.uid, `%${q}%`), ilike(usersTable.phone, `%${q}%`), ilike(usersTable.name, `%${q}%`), ilike(usersTable.referralCode, `%${q}%`)));
  if (role) conds.push(eq(usersTable.role, role));
  if (status) conds.push(eq(usersTable.status, status));
  const rows = conds.length
    ? await db.select().from(usersTable).where(and(...conds)).orderBy(desc(usersTable.createdAt)).limit(200)
    : await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(200);
  res.json(rows.map(({ passwordHash, ...u }) => u));
});

// ─── Admin: full user dossier ─────────────────────────────────────────────────
router.get("/admin/users/:id/full", requireAuth, supportPlus, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, ...safe } = user;
  const [kyc, wallets, sessions, inrDeps, cryDeps, inrWds, cryWds, futPos, logins, orderStats] = await Promise.all([
    db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, id)).orderBy(desc(kycRecordsTable.createdAt)),
    db.select().from(walletsTable).where(eq(walletsTable.userId, id)),
    db.select({ id: sessionsTable.id, createdAt: sessionsTable.createdAt, expiresAt: sessionsTable.expiresAt, ip: sessionsTable.ip, userAgent: sessionsTable.userAgent }).from(sessionsTable).where(eq(sessionsTable.userId, id)).orderBy(desc(sessionsTable.createdAt)).limit(20),
    db.select().from(inrDepositsTable).where(eq(inrDepositsTable.userId, id)).orderBy(desc(inrDepositsTable.createdAt)).limit(50),
    db.select().from(cryptoDepositsTable).where(eq(cryptoDepositsTable.userId, id)).orderBy(desc(cryptoDepositsTable.createdAt)).limit(50),
    db.select().from(inrWithdrawalsTable).where(eq(inrWithdrawalsTable.userId, id)).orderBy(desc(inrWithdrawalsTable.createdAt)).limit(50),
    db.select().from(cryptoWithdrawalsTable).where(eq(cryptoWithdrawalsTable.userId, id)).orderBy(desc(cryptoWithdrawalsTable.createdAt)).limit(50),
    db.select({
      id: futuresPositionsTable.id, pairId: futuresPositionsTable.pairId, symbol: pairsTable.symbol,
      side: futuresPositionsTable.side, leverage: futuresPositionsTable.leverage,
      qty: futuresPositionsTable.qty, entryPrice: futuresPositionsTable.entryPrice,
      markPrice: futuresPositionsTable.markPrice, marginAmount: futuresPositionsTable.marginAmount,
      unrealizedPnl: futuresPositionsTable.unrealizedPnl, liquidationPrice: futuresPositionsTable.liquidationPrice,
      status: futuresPositionsTable.status, openedAt: futuresPositionsTable.openedAt,
    })
      .from(futuresPositionsTable)
      .leftJoin(pairsTable, eq(futuresPositionsTable.pairId, pairsTable.id))
      .where(and(eq(futuresPositionsTable.userId, id), eq(futuresPositionsTable.status, "open")))
      .orderBy(desc(futuresPositionsTable.openedAt))
      .limit(50),
    db.select({
      id: loginLogsTable.id, ip: loginLogsTable.ip, userAgent: loginLogsTable.userAgent,
      success: loginLogsTable.success, reason: loginLogsTable.reason, createdAt: loginLogsTable.createdAt,
    })
      .from(loginLogsTable).where(eq(loginLogsTable.userId, id))
      .orderBy(desc(loginLogsTable.createdAt)).limit(15),
    db.select({
      total: sql<number>`count(*)::int`,
      filled: sql<number>`count(*) filter (where ${ordersTable.status} = 'filled')::int`,
      open: sql<number>`count(*) filter (where ${ordersTable.status} in ('open','partial'))::int`,
    }).from(ordersTable).where(eq(ordersTable.userId, id)),
  ]);
  res.json({
    user: safe,
    security: {
      twoFaEnabled: user.twoFaEnabled,
      activeSessions: sessions.length,
      lastSessionAt: sessions[0]?.createdAt ?? null,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      lastLoginAt: user.lastLoginAt,
    },
    stats: {
      orders: orderStats[0] ?? { total: 0, filled: 0, open: 0 },
      inrDepositCount: inrDeps.length,
      cryptoDepositCount: cryDeps.length,
      walletCount: wallets.length,
    },
    kyc, wallets, sessions, inrDeposits: inrDeps, cryptoDeposits: cryDeps, inrWithdrawals: inrWds, cryptoWithdrawals: cryWds,
    futuresPositions: futPos, loginLogs: logins,
  });
});

// Admin: full user edit (extends the basic /admin/users/:id PATCH)
router.patch("/admin/users/:id/full", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const allowed: Record<string, unknown> = {};
  for (const k of ["role", "status", "kycLevel", "vipTier", "name", "phone", "email", "twoFaEnabled", "emailVerified", "phoneVerified"]) {
    if (k in (req.body ?? {})) allowed[k] = req.body[k];
  }
  if (Object.keys(allowed).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [u] = await db.update(usersTable).set(allowed).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, ...safe } = u;
  res.json(safe);
});

// Admin: toggle email/phone verified flag
router.post("/admin/users/:id/verify", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const channel = String(req.body?.channel ?? "");
  const value = req.body?.value !== false;
  if (channel !== "email" && channel !== "phone") {
    res.status(400).json({ error: "channel must be 'email' or 'phone'" });
    return;
  }
  const set: Record<string, unknown> =
    channel === "email" ? { emailVerified: value } : { phoneVerified: value };
  const [u] = await db.update(usersTable).set(set).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, ...safe } = u;
  res.json({ ok: true, user: safe });
});

// ─── Admin: funding rates ─────────────────────────────────────────────────────
router.get("/admin/funding-rates", requireAuth, supportPlus, async (req, res): Promise<void> => {
  const pairId = req.query.pairId ? Number(req.query.pairId) : null;
  const rows = pairId
    ? await db.select().from(fundingRatesTable).where(eq(fundingRatesTable.pairId, pairId)).orderBy(desc(fundingRatesTable.fundingTime)).limit(200)
    : await db.select().from(fundingRatesTable).orderBy(desc(fundingRatesTable.fundingTime)).limit(200);
  res.json(rows);
});
router.post("/admin/funding-rates", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const { pairId, rate, intervalHours, fundingTime } = req.body ?? {};
  if (!pairId || rate === undefined || !fundingTime) { res.status(400).json({ error: "pairId, rate, fundingTime required" }); return; }
  const [r] = await db.insert(fundingRatesTable).values({
    pairId: Number(pairId), rate: String(rate), intervalHours: Number(intervalHours ?? 8), fundingTime: new Date(fundingTime),
  }).returning();
  res.status(201).json(r);
});
router.patch("/admin/funding-rates/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b: Record<string, unknown> = { ...req.body };
  if (b.fundingTime) b.fundingTime = new Date(b.fundingTime as string);
  if (b.rate !== undefined) b.rate = String(b.rate);
  const [r] = await db.update(fundingRatesTable).set(b).where(eq(fundingRatesTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json(r);
});
router.delete("/admin/funding-rates/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  await db.delete(fundingRatesTable).where(eq(fundingRatesTable.id, Number(req.params.id)));
  res.sendStatus(204);
});

// ─── Admin: futures positions + risk ─────────────────────────────────────────
router.get("/admin/futures-positions", requireAuth, supportPlus, async (req, res): Promise<void> => {
  const status = (req.query.status as string) || "open";
  const { futuresPositionsTable } = await import("@workspace/db");
  const rows = status === "all"
    ? await db.select().from(futuresPositionsTable).orderBy(desc(futuresPositionsTable.openedAt)).limit(500)
    : await db.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.status, status)).orderBy(desc(futuresPositionsTable.openedAt)).limit(500);
  res.json(rows);
});
router.get("/admin/futures-engine/status", requireAuth, supportPlus, async (_req, res): Promise<void> => {
  const { getFuturesEngineStatus } = await import("../lib/futures-engine");
  res.json(getFuturesEngineStatus());
});
router.post("/admin/futures-engine/run-funding", requireAuth, adminOnly, async (_req, res): Promise<void> => {
  const { tickAutoFunding, tickSettleFunding } = await import("../lib/futures-engine");
  const created = await tickAutoFunding();
  const settled = await tickSettleFunding();
  res.json({ created, settled });
});
router.post("/admin/futures-engine/run-risk", requireAuth, adminOnly, async (_req, res): Promise<void> => {
  const { tickRiskCheck } = await import("../lib/futures-engine");
  const result = await tickRiskCheck();
  res.json(result);
});
router.post("/admin/futures-positions/:id/liquidate", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const { futuresPositionsTable, walletsTable, pairsTable } = await import("@workspace/db");
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  await db.transaction(async (trx) => {
    const [pos] = await trx.select().from(futuresPositionsTable).where(eq(futuresPositionsTable.id, id)).for("update").limit(1);
    if (!pos) throw new Error("Not found");
    if (pos.status !== "open") throw new Error(`Cannot liquidate — status is ${pos.status}`);
    const [pair] = await trx.select().from(pairsTable).where(eq(pairsTable.id, pos.pairId)).limit(1);
    if (!pair) throw new Error("Pair missing");
    const [w] = await trx.select().from(walletsTable).where(and(
      eq(walletsTable.userId, pos.userId), eq(walletsTable.coinId, pair.quoteCoinId), eq(walletsTable.walletType, "futures"),
    )).for("update").limit(1);
    if (w) {
      await trx.update(walletsTable).set({
        locked: sql`${walletsTable.locked} - ${pos.marginAmount}`,
        updatedAt: new Date(),
      }).where(eq(walletsTable.id, w.id));
    }
    await trx.update(futuresPositionsTable).set({
      status: "liquidated", closedAt: new Date(), closeReason: "Forced liquidation by admin",
    }).where(eq(futuresPositionsTable.id, id));
  }).then(() => res.json({ ok: true })).catch((e) => res.status(400).json({ error: (e as Error).message }));
});

// ─── Admin: API keys (Binance etc) ────────────────────────────────────────────
function maskSecret(s: string | null | undefined): string {
  if (!s) return "";
  if (s.length <= 8) return "•".repeat(s.length);
  return s.slice(0, 4) + "•".repeat(Math.max(0, s.length - 8)) + s.slice(-4);
}
router.get("/admin/api-keys", requireAuth, adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(adminApiKeysTable).orderBy(desc(adminApiKeysTable.createdAt));
  res.json(rows.map(r => ({ ...r, apiKey: maskSecret(r.apiKey), apiSecret: maskSecret(r.apiSecret) })));
});
router.post("/admin/api-keys", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const { provider, label, apiKey, apiSecret, baseUrl, isActive } = req.body ?? {};
  if (!provider) { res.status(400).json({ error: "provider required" }); return; }
  const [r] = await db.insert(adminApiKeysTable).values({
    provider, label: label ?? "", apiKey: apiKey ?? "", apiSecret: apiSecret ?? "",
    baseUrl: baseUrl ?? null, isActive: String(isActive ?? "true"),
  }).returning();
  res.status(201).json({ ...r, apiKey: maskSecret(r.apiKey), apiSecret: maskSecret(r.apiSecret) });
});
router.patch("/admin/api-keys/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b: Record<string, unknown> = {};
  for (const k of ["provider", "label", "baseUrl", "isActive"]) if (k in (req.body ?? {})) b[k] = (req.body as any)[k];
  // Only overwrite secrets when explicitly provided (and non-empty)
  if (typeof req.body?.apiKey === "string" && req.body.apiKey.length > 0 && !req.body.apiKey.includes("•")) b.apiKey = req.body.apiKey;
  if (typeof req.body?.apiSecret === "string" && req.body.apiSecret.length > 0 && !req.body.apiSecret.includes("•")) b.apiSecret = req.body.apiSecret;
  if (typeof b.isActive !== "undefined") b.isActive = String(b.isActive);
  const [r] = await db.update(adminApiKeysTable).set(b).where(eq(adminApiKeysTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...r, apiKey: maskSecret(r.apiKey), apiSecret: maskSecret(r.apiSecret) });
});
router.delete("/admin/api-keys/:id", requireAuth, adminOnly, async (req, res): Promise<void> => {
  await db.delete(adminApiKeysTable).where(eq(adminApiKeysTable.id, Number(req.params.id)));
  res.sendStatus(204);
});

// ─── Admin: coin search (extends /admin/coins) ────────────────────────────────
router.get("/admin/coins-search", requireAuth, supportPlus, async (req, res): Promise<void> => {
  const q = (req.query.q as string) || "";
  const rows = q
    ? await db.select().from(coinsTable).where(or(ilike(coinsTable.symbol, `%${q}%`), ilike(coinsTable.name, `%${q}%`))).orderBy(coinsTable.symbol).limit(200)
    : await db.select().from(coinsTable).orderBy(coinsTable.symbol).limit(200);
  res.json(rows);
});

export default router;
