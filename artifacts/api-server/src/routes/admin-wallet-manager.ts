/**
 * Admin Wallet Manager
 * GET  /api/admin/wallet-manager           — all users with balances (paginated)
 * GET  /api/admin/wallet-manager/:userId   — single user full balance detail
 * POST /api/admin/wallet-manager/master    — list/add master wallets
 * PUT  /api/admin/wallet-manager/master/:id — update master wallet
 */
import { Router, type IRouter } from "express";
import { db, usersTable, walletsTable, coinsTable, masterWalletsTable } from "@workspace/db";
import { eq, ilike, or, desc, and } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { getRawTick, getInrRate } from "../lib/price-service";
import { z } from "zod/v4";

const router: IRouter = Router();
const adminAuth = requireRole("admin", "superadmin");

function assetPrice(symbol: string): number {
  if (symbol === "USDT" || symbol === "USDC") return 1;
  if (symbol === "INR") { const r = getInrRate(); return r > 0 ? 1 / r : 0.012; }
  const tick = getRawTick(`${symbol}USDT`);
  return tick ? tick.usdt : 0;
}

/* GET /admin/wallet-manager */
router.get("/admin/wallet-manager", adminAuth, async (req, res): Promise<void> => {
  const search = (req.query.search as string ?? "").trim();
  const limit  = Math.min(100, parseInt(req.query.limit  as string ?? "50", 10) || 50);
  const offset =               parseInt(req.query.offset as string ?? "0",  10) || 0;

  let baseQ = db.select({
    id: usersTable.id, email: usersTable.email, username: usersTable.name,
    status: usersTable.status, createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(desc(usersTable.createdAt)).$dynamic();

  if (search) baseQ = baseQ.where(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`)));

  const users = await baseQ.limit(limit).offset(offset);

  const result = await Promise.all(users.map(async (u) => {
    const wallets = await db.select({
      balance: walletsTable.balance, locked: walletsTable.locked,
      walletType: walletsTable.walletType, symbol: coinsTable.symbol,
    }).from(walletsTable)
      .leftJoin(coinsTable, eq(walletsTable.coinId, coinsTable.id))
      .where(eq(walletsTable.userId, u.id));

    const balances = wallets.map(w => {
      const total = parseFloat(w.balance as string ?? "0") + parseFloat(w.locked as string ?? "0");
      const price = assetPrice(w.symbol ?? "USDT");
      return { asset: w.symbol ?? "?", free: parseFloat(w.balance as string ?? "0"), locked: parseFloat(w.locked as string ?? "0"), usdValue: +(total * price).toFixed(2) };
    }).filter(b => b.free + b.locked > 0);

    const totalUsdValue = +(balances.reduce((s, b) => s + b.usdValue, 0)).toFixed(2);
    return { ...u, balances, totalUsdValue };
  }));

  res.json({ users: result, limit, offset });
});

/* GET /admin/wallet-manager/:userId */
router.get("/admin/wallet-manager/:userId", adminAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const wallets = await db.select({
    id: walletsTable.id, balance: walletsTable.balance, locked: walletsTable.locked,
    walletType: walletsTable.walletType, symbol: coinsTable.symbol, coinName: coinsTable.name,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(walletsTable.coinId, coinsTable.id))
    .where(eq(walletsTable.userId, userId));

  const balances = wallets.map(w => {
    const free   = parseFloat(w.balance as string ?? "0");
    const locked = parseFloat(w.locked  as string ?? "0");
    const price  = assetPrice(w.symbol ?? "USDT");
    return { id: w.id, asset: w.symbol, name: w.coinName, walletType: w.walletType, free, locked, total: free + locked, usdValue: +((free + locked) * price).toFixed(2) };
  });

  const totalUsdValue = +(balances.reduce((s, b) => s + b.usdValue, 0)).toFixed(2);
  res.json({ user: { id: user.id, email: user.email, username: user.name, status: user.status }, balances, totalUsdValue });
});

/* ── Master Wallets ───────────────────────────────────────────────────────── */

const MasterWalletSchema = z.object({
  coin:           z.string().min(1).max(20).transform(s => s.toUpperCase()),
  network:        z.string().min(1).max(50),
  label:          z.string().min(1).max(100),
  depositAddress: z.string().optional(),
  xpubKey:        z.string().optional(),
  notes:          z.string().optional(),
  isActive:       z.boolean().optional().default(true),
});

router.get("/admin/master-wallets", adminAuth, async (_req, res): Promise<void> => {
  const wallets = await db.select().from(masterWalletsTable).orderBy(desc(masterWalletsTable.createdAt));
  res.json(wallets);
});

router.post("/admin/master-wallets", adminAuth, async (req, res): Promise<void> => {
  const parsed = MasterWalletSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [w] = await db.insert(masterWalletsTable).values(parsed.data).returning();
  res.status(201).json(w);
});

router.put("/admin/master-wallets/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = MasterWalletSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [w] = await db.update(masterWalletsTable).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(masterWalletsTable.id, id)).returning();
  if (!w) { res.status(404).json({ error: "Master wallet not found" }); return; }
  res.json(w);
});

router.delete("/admin/master-wallets/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(masterWalletsTable).where(eq(masterWalletsTable.id, id));
  res.json({ ok: true });
});

export default router;
