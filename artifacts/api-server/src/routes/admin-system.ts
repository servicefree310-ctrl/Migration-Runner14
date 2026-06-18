/**
 * Admin system routes:
 *   GET  /api/admin/system-status        — live service health (DB, Redis, Go, Process)
 *   POST /api/admin/restart              — graceful API server restart
 *   GET  /api/admin/trades               — filled order history
 *   GET  /api/admin/deposits             — deposit transactions
 *   GET  /api/admin/inr-transactions     — INR deposit/withdrawal history
 *   PUT  /api/admin/inr-transactions/:id — approve/reject INR tx
 */
import { Router, type IRouter } from "express";
import { db, ordersTable, cryptoDepositsTable, usersTable, inrTransactionsTable, walletsTable, coinsTable, pairsTable } from "@workspace/db";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { isRedisReady, getRedis } from "../lib/redis";
import { logAdminAction } from "../lib/audit";
import { isLeader, getInstanceId } from "../lib/leader";
import { getWsClientCount } from "../lib/ws-state";

const router: IRouter = Router();
const adminAuth = requireRole("admin", "superadmin");

/* ─── System Status ──────────────────────────────────────────────────────── */
router.get("/admin/system-status", adminAuth, async (req: any, res): Promise<void> => {
  // ── Redis ───────────────────────────────────────────────────────────────
  let redisStatus = "disconnected";
  let redisLatencyMs: number | null = null;
  let redisConnectedClients: number | null = null;
  let redisUsedMemoryHuman: string | null = null;
  let redisVersion: string | null = null;
  try {
    const r = getRedis();
    if (isRedisReady() && r) {
      const t0 = Date.now();
      await r.ping();
      redisLatencyMs = Date.now() - t0;
      redisStatus = "ok";
      try {
        const info = await r.info("clients");
        const cm = info.match(/connected_clients:(\d+)/);
        if (cm) redisConnectedClients = parseInt(cm[1], 10);
        const memInfo = await r.info("memory");
        const mm = memInfo.match(/used_memory_human:(\S+)/);
        if (mm) redisUsedMemoryHuman = mm[1];
        const serverInfo = await r.info("server");
        const vm = serverInfo.match(/redis_version:(\S+)/);
        if (vm) redisVersion = vm[1];
      } catch { /* non-critical */ }
    }
  } catch { redisStatus = "error"; }

  // ── Database ─────────────────────────────────────────────────────────────
  let dbStatus = "ok";
  let dbLatencyMs: number | null = null;
  let dbVersion: string | null = null;
  try {
    const t0 = Date.now();
    const res2 = await db.execute(sql`SELECT version()`);
    dbLatencyMs = Date.now() - t0;
    const verStr = (res2.rows?.[0] as any)?.version ?? "";
    const vm = verStr.match(/PostgreSQL ([\d.]+)/);
    if (vm) dbVersion = vm[1];
  } catch { dbStatus = "error"; }

  // ── Futures Matching Engine (Redis-based) ────────────────────────────────
  const { getFuturesEngineStats } = await import("../lib/futures-matching-engine");
  const futuresStats = getFuturesEngineStats();

  // ── Process ──────────────────────────────────────────────────────────────
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  res.json({
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus, latencyMs: dbLatencyMs, version: dbVersion },
      redis: {
        status: redisStatus,
        latencyMs: redisLatencyMs,
        connectedClients: redisConnectedClients,
        usedMemoryHuman: redisUsedMemoryHuman,
        version: redisVersion,
      },
      futuresEngine: {
        status: "ok",
        engine: "redis",
        ...futuresStats,
      },
      process: {
        status:       "ok",
        uptimeSecs:   Math.round(uptime),
        uptimeHuman:  `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        memMb:        Math.round(mem.rss / 1024 / 1024),
        heapUsedMb:   Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
        heapTotalMb:  Math.round(mem.heapTotal / 1024 / 1024 * 10) / 10,
        pid:          process.pid,
        nodeVersion:  process.version,
        env:          process.env["NODE_ENV"] ?? "production",
      },
    },
    meta: {
      instanceId: getInstanceId(),
      isLeader:   isLeader(),
      wsClients:  getWsClientCount(),
    },
  });
});

/* ─── Graceful Restart ───────────────────────────────────────────────────── */
router.post("/admin/restart", adminAuth, async (req: any, res): Promise<void> => {
  await logAdminAction(req, { action: "system.restart", entity: "api-server", payload: { pid: process.pid } }).catch(() => null);
  req.log.info({ adminId: req.user?.id }, "admin: graceful restart requested");
  res.json({ ok: true, message: "API server restarting… will be back in ~5s", pid: process.pid });
  // Give the response time to flush, then exit cleanly — the workflow manager restarts the process.
  setTimeout(() => process.exit(0), 800);
});

/* ─── Trade History ──────────────────────────────────────────────────────── */
router.get("/admin/trades", adminAuth, async (req, res): Promise<void> => {
  const { symbol, userId, limit, offset } = req.query;
  const lim = Math.min(parseInt(String(limit ?? "50"), 10), 500);
  const off = parseInt(String(offset ?? "0"), 10);

  const conds: any[] = [sql`${ordersTable.status} IN ('filled', 'partially_filled')`, sql`${ordersTable.filledQty}::numeric > 0`];
  if (symbol) conds.push(sql`EXISTS(SELECT 1 FROM pairs WHERE pairs.id = ${ordersTable.pairId} AND pairs.symbol = ${String(symbol)})`);
  if (userId) conds.push(eq(ordersTable.userId, parseInt(String(userId), 10)));

  const rows = await db.select().from(ordersTable)
    .where(and(...conds)).orderBy(desc(ordersTable.updatedAt)).limit(lim).offset(off);

  const result = await Promise.all(rows.map(async (o) => {
    const [u] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, o.userId)).limit(1);
    const [pair] = await db.select({ symbol: pairsTable.symbol }).from(pairsTable).where(eq(pairsTable.id, o.pairId)).limit(1);
    const filled = parseFloat(o.filledQty ?? "0");
    const price  = parseFloat(o.avgPrice ?? o.price ?? "0");
    return {
      id: o.id, userId: o.userId,
      username: u?.name ?? "?", email: u?.email ?? "",
      symbol: pair?.symbol ?? String(o.pairId), side: o.side, type: o.type, status: o.status,
      quantity: parseFloat(o.qty), filledQuantity: filled,
      avgFillPrice: price, value: parseFloat((filled * price).toFixed(2)),
      fee: o.fee != null ? parseFloat(o.fee) : null,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
      updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    };
  }));
  res.json(result);
});

/* ─── Deposit History ────────────────────────────────────────────────────── */
router.get("/admin/deposits", adminAuth, async (req, res): Promise<void> => {
  const { status, userId, asset, limit, offset } = req.query;
  const lim = Math.min(parseInt(String(limit ?? "50"), 10), 500);
  const off = parseInt(String(offset ?? "0"), 10);

  const conds: any[] = [];
  if (status && status !== "all") conds.push(eq(cryptoDepositsTable.status, String(status) as any));
  if (userId) conds.push(eq(cryptoDepositsTable.userId, parseInt(String(userId), 10)));

  const rows = await db.select().from(cryptoDepositsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(cryptoDepositsTable.createdAt)).limit(lim).offset(off);
  res.json(rows);
});

/* ─── INR Transactions ───────────────────────────────────────────────────── */
router.get("/admin/inr-transactions", adminAuth, async (req, res): Promise<void> => {
  const { type, status, limit, offset, search } = req.query;
  const lim = Math.min(200, parseInt(String(limit ?? "50"), 10) || 50);
  const off = parseInt(String(offset ?? "0"), 10) || 0;

  const rows = await db.select({
    tx:       inrTransactionsTable,
    username: usersTable.name,
    email:    usersTable.email,
  }).from(inrTransactionsTable)
    .leftJoin(usersTable, eq(inrTransactionsTable.userId, usersTable.id))
    .orderBy(desc(inrTransactionsTable.createdAt))
    .limit(lim).offset(off);

  let result = rows;
  if (type   && type   !== "all") result = result.filter(r => r.tx.type   === type);
  if (status && status !== "all") result = result.filter(r => r.tx.status === status);
  if (search) {
    const s = String(search).toLowerCase();
    result = result.filter(r => r.email?.toLowerCase().includes(s) || r.username?.toLowerCase().includes(s) || r.tx.utrNumber?.includes(s));
  }

  res.json(result.map(r => ({
    id:           r.tx.id,
    userId:       r.tx.userId,
    username:     r.username,
    email:        r.email,
    type:         r.tx.type,
    amountInr:    parseFloat(r.tx.amountInr),
    usdAmount:    r.tx.usdAmount ? parseFloat(r.tx.usdAmount) : null,
    method:       r.tx.method,
    upiId:        r.tx.upiId,
    utrNumber:    r.tx.utrNumber,
    referenceNumber: r.tx.referenceNumber,
    status:       r.tx.status,
    adminNote:    r.tx.adminNote,
    createdAt:    r.tx.createdAt instanceof Date ? r.tx.createdAt.toISOString() : r.tx.createdAt,
  })));
});

router.put("/admin/inr-transactions/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { status, adminNote } = req.body as { status?: string; adminNote?: string };
  if (!status) { res.status(400).json({ error: "status required" }); return; }

  // All reads + writes inside one transaction with FOR UPDATE to prevent double-credit
  // (two admins clicking approve simultaneously would otherwise both pass the status check)
  await db.transaction(async (t) => {
    const [tx] = await t.select().from(inrTransactionsTable)
      .where(eq(inrTransactionsTable.id, id)).for("update").limit(1);
    if (!tx) { const e: any = new Error("Transaction not found"); e.code = 404; throw e; }

    if (status === "completed" && tx.type === "deposit" && tx.status !== "completed") {
      const amountInr = parseFloat(tx.amountInr);
      const [coin] = await t.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
      if (coin) {
        const [w] = await t.select().from(walletsTable)
          .where(and(eq(walletsTable.userId, tx.userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "inr")))
          .for("update").limit(1);
        if (w) {
          await t.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${amountInr}`, updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        } else {
          await t.insert(walletsTable).values({ userId: tx.userId, coinId: coin.id, walletType: "inr", balance: String(amountInr), locked: "0" });
        }
      }
      await t.update(inrTransactionsTable).set({ status: "completed", adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(eq(inrTransactionsTable.id, id));

    } else if (status === "rejected" && tx.type === "withdrawal" && tx.status === "pending") {
      const amountInr = parseFloat(tx.amountInr);
      const [coin] = await t.select({ id: coinsTable.id }).from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
      if (coin) {
        const [w] = await t.select().from(walletsTable)
          .where(and(eq(walletsTable.userId, tx.userId), eq(walletsTable.coinId, coin.id), eq(walletsTable.walletType, "inr")))
          .for("update").limit(1);
        if (w) {
          await t.update(walletsTable).set({
            balance: sql`${walletsTable.balance} + ${amountInr}`,
            locked:  sql`GREATEST(0, ${walletsTable.locked} - ${amountInr})`,
            updatedAt: new Date(),
          }).where(eq(walletsTable.id, w.id));
        }
      }
      await t.update(inrTransactionsTable).set({ status: "rejected", adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(eq(inrTransactionsTable.id, id));

    } else {
      await t.update(inrTransactionsTable).set({ status: status as any, adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(eq(inrTransactionsTable.id, id));
    }
  }).catch((e: any) => {
    if (e?.code === 404) { res.status(404).json({ error: e.message }); return; }
    throw e;
  });

  if (!res.headersSent) res.json({ ok: true, id, status });
});

export default router;
