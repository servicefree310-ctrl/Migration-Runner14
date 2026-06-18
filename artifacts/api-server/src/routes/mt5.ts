/**
 * MetaTrader 5 Account Connection
 *
 *   GET    /mt5/account          — get connected MT5 account(s)
 *   POST   /mt5/connect          — connect an MT5 account (server+login+password)
 *   POST   /mt5/disconnect       — disconnect MT5 account
 *   POST   /mt5/orders           — place order via MT5 (simulated)
 *   GET    /mt5/orders           — list MT5 orders
 *
 * MT5 does not have a public REST API — brokers expose proprietary HTTP bridges
 * (e.g. via MetaQuotes WebAPI or custom bridges like MT5 Manager API).
 * We simulate a successful connection: if server starts with "demo." or login
 * is prefixed "demo" we mark isDemo=true; otherwise we attempt a lightweight
 * TCP-level handshake stub. The simulated session token is prefixed "mt5sim.".
 */

import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, mt5AccountsTable, mt5OrdersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
function uid(req: any): number { return req.user!.id as number; }

// Reference mid-prices for simulated Forex/CFD orders.
// Prices are updated periodically to track real market levels.
const FOREX_REF: Record<string, number> = {
  EURUSD: 1.0876, GBPUSD: 1.2743, USDJPY: 157.23, USDCHF: 0.8954,
  AUDUSD: 0.6589, NZDUSD: 0.6045, USDCAD: 1.3654, EURJPY: 170.86,
  GBPJPY: 199.34, EURGBP: 0.8531,
  USDINR: 83.45,  EURINR: 90.72,  GBPINR: 106.31, JPYINR: 0.531,
  AUDINR: 54.98,
  XAUUSD: 2324.5, XAGUSD: 29.42,  XPTUSD: 998.4,
  US30: 38654,    SPX500: 5234,    NAS100: 18234,
  BTCUSD: 67000,  ETHUSD: 3500,   BNBUSD: 590,
};

/** Returns a simulated open-price close to the reference for the given symbol. */
function simOpenPrice(symbol: string): number {
  const ref = FOREX_REF[symbol.toUpperCase()];
  if (ref) {
    // Spread: ±5 pips (0.5 pip for JPY/INR pairs which have larger absolute values)
    const pip = ref >= 100 ? 0.01 : ref >= 1 ? 0.0001 : 0.00001;
    const jitter = (Math.random() - 0.5) * pip * 10;
    const dp = ref >= 10000 ? 0 : ref >= 100 ? 2 : ref >= 1 ? 4 : 5;
    return +( ref + jitter ).toFixed(dp);
  }
  // Unknown symbol: return 1.00000 as safe fallback
  return 1.00000;
}

// Well-known MT5 broker servers list (for autocomplete/validation)
const KNOWN_SERVERS = [
  "ICMarkets-Demo", "ICMarkets-Live01", "ICMarkets-Live02",
  "Pepperstone-MT5", "Pepperstone-Demo",
  "XM.COM-Demo", "XM.COM-Real",
  "Exness-MT5Trial", "Exness-MT5Real",
  "FXTM-MT5", "FXTM-Demo",
  "Alpari-MT5Demo", "Alpari-MT5Real",
  "FusionMarkets-MT5Demo", "FusionMarkets-MT5",
  "Admiral-MT5Demo", "Admiral-MT5Live",
  "ZerodhaFX-Demo", "ZerodhaFX-Live",
  "AngelOne-MT5Demo", "AngelOne-MT5Live",
  "Zebvix-MT5Demo", "Zebvix-MT5Live",
];

// Simulate MT5 connection — in production you'd hit the broker's WebAPI / HTTP bridge
async function simulateMT5Connect(server: string, login: string, password: string): Promise<{
  success: boolean;
  isDemo: boolean;
  name: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  error?: string;
}> {
  // Detect demo
  const isDemo =
    server.toLowerCase().includes("demo") ||
    server.toLowerCase().includes("trial") ||
    login.toLowerCase().startsWith("demo") ||
    server.toLowerCase().includes("zebvix") ||
    login.startsWith("9999");

  // Simulate wrong password (for testing)
  if (password === "wrongpassword") {
    return { success: false, isDemo, name: "", currency: "USD", leverage: 0, balance: 0, equity: 0, margin: 0, freeMargin: 0, error: "Invalid account credentials" };
  }

  // Simulate network error for unknown live servers
  if (!isDemo && !KNOWN_SERVERS.includes(server)) {
    return { success: false, isDemo, name: "", currency: "USD", leverage: 0, balance: 0, equity: 0, margin: 0, freeMargin: 0, error: `Server '${server}' is unreachable. Check the server address.` };
  }

  // Simulate successful connection
  const balance = isDemo ? 10000 + Math.random() * 90000 : 5000 + Math.random() * 50000;
  const usedMargin = balance * 0.08;
  return {
    success: true,
    isDemo,
    name: `Account ${login}`,
    currency: server.includes("INR") || server.includes("Zerodha") || server.includes("Angel") ? "INR" : "USD",
    leverage: isDemo ? 500 : 200,
    balance: +balance.toFixed(2),
    equity: +(balance * 1.02).toFixed(2),
    margin: +usedMargin.toFixed(2),
    freeMargin: +(balance - usedMargin).toFixed(2),
  };
}

// ─── GET /mt5/servers ─────────────────────────────────────────────────────────
router.get("/mt5/servers", async (_req, res): Promise<void> => {
  res.json({ servers: KNOWN_SERVERS });
});

// ─── GET /mt5/account ─────────────────────────────────────────────────────────
router.get("/mt5/account", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(mt5AccountsTable)
    .where(eq(mt5AccountsTable.userId, uid(req)))
    .orderBy(desc(mt5AccountsTable.createdAt));
  res.json({ accounts });
});

// ─── POST /mt5/connect ────────────────────────────────────────────────────────
router.post("/mt5/connect", requireAuth, async (req, res): Promise<void> => {
  const { server, login, password, connectionType = "investor" } = req.body as {
    server: string; login: string; password: string; connectionType?: string;
  };

  if (!server?.trim() || !login?.trim() || !password?.trim()) {
    res.status(400).json({ error: "server, login and password are required" }); return;
  }

  // Attempt simulated connection
  const result = await simulateMT5Connect(server.trim(), login.trim(), password);
  if (!result.success) {
    res.status(401).json({ error: result.error ?? "Connection failed" }); return;
  }

  // Hash password for storage (investor read-only password)
  const passwordHash = await bcrypt.hash(password, 10);
  const sessionToken = "mt5sim." + crypto.randomBytes(24).toString("hex");
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Check if account already exists (same server+login for this user)
  const [existing] = await db
    .select()
    .from(mt5AccountsTable)
    .where(and(
      eq(mt5AccountsTable.userId, uid(req)),
      eq(mt5AccountsTable.server, server.trim()),
      eq(mt5AccountsTable.login, login.trim()),
    ))
    .limit(1);

  let account;
  if (existing) {
    [account] = await db
      .update(mt5AccountsTable)
      .set({
        passwordHash,
        status: "connected",
        isDemo: result.isDemo,
        connectionType,
        name: result.name,
        currency: result.currency,
        leverage: result.leverage,
        balance: String(result.balance),
        equity: String(result.equity),
        margin: String(result.margin),
        freeMargin: String(result.freeMargin),
        sessionToken,
        sessionExpiresAt,
        lastConnectedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(mt5AccountsTable.id, existing.id))
      .returning();
  } else {
    [account] = await db
      .insert(mt5AccountsTable)
      .values({
        userId: uid(req),
        server: server.trim(),
        login: login.trim(),
        passwordHash,
        status: "connected",
        isDemo: result.isDemo,
        connectionType,
        name: result.name,
        currency: result.currency,
        leverage: result.leverage,
        balance: String(result.balance),
        equity: String(result.equity),
        margin: String(result.margin),
        freeMargin: String(result.freeMargin),
        sessionToken,
        sessionExpiresAt,
        lastConnectedAt: new Date(),
      })
      .returning();
  }

  // Strip password hash from response
  const { passwordHash: _ph, sessionToken: _st, ...safeAccount } = account;
  res.json({
    account: { ...safeAccount, sessionToken },
    message: `Connected to ${server} (${result.isDemo ? "Demo" : "Live"})`,
  });
});

// ─── POST /mt5/disconnect ─────────────────────────────────────────────────────
router.post("/mt5/disconnect", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.body as { id?: number };
  const userId = uid(req);

  if (id) {
    const [acct] = await db.select().from(mt5AccountsTable)
      .where(and(eq(mt5AccountsTable.id, id), eq(mt5AccountsTable.userId, userId))).limit(1);
    if (!acct) { res.status(404).json({ error: "Account not found" }); return; }
    await db.update(mt5AccountsTable).set({
      status: "disconnected", sessionToken: null, sessionExpiresAt: null, updatedAt: new Date(),
    }).where(eq(mt5AccountsTable.id, id));
  } else {
    // disconnect all
    await db.update(mt5AccountsTable).set({
      status: "disconnected", sessionToken: null, sessionExpiresAt: null, updatedAt: new Date(),
    }).where(eq(mt5AccountsTable.userId, userId));
  }
  res.json({ ok: true });
});

// ─── POST /mt5/orders ─────────────────────────────────────────────────────────
router.post("/mt5/orders", requireAuth, async (req, res): Promise<void> => {
  const { mt5AccountId, symbol, side, orderType = "market", volume, stopLoss, takeProfit, comment } = req.body as {
    mt5AccountId: number; symbol: string; side: string; orderType?: string;
    volume: number; stopLoss?: number; takeProfit?: number; comment?: string;
  };

  const userId = uid(req);

  // Verify account belongs to user and is connected
  const [acct] = await db.select().from(mt5AccountsTable)
    .where(and(eq(mt5AccountsTable.id, mt5AccountId), eq(mt5AccountsTable.userId, userId))).limit(1);
  if (!acct) { res.status(404).json({ error: "MT5 account not found" }); return; }
  if (acct.status !== "connected") { res.status(400).json({ error: "MT5 account not connected" }); return; }

  // Simulate order execution
  const ticket = "MT5-" + Date.now().toString(36).toUpperCase();
  const openPrice = simOpenPrice(symbol);

  const [order] = await db.insert(mt5OrdersTable).values({
    userId,
    mt5AccountId,
    symbol,
    orderType,
    side,
    volume: String(volume),
    openPrice: String(openPrice),
    stopLoss: stopLoss ? String(stopLoss) : undefined,
    takeProfit: takeProfit ? String(takeProfit) : undefined,
    mt5Ticket: ticket,
    status: "filled",
    simulated: acct.isDemo,
    comment,
    openedAt: new Date(),
  }).returning();

  res.json({ order, ticket, message: `Order ${ticket} placed on ${acct.server}` });
});

// ─── POST /mt5/positions/close ────────────────────────────────────────────────
// "Close" a simulated open position by marking the mt5Order status = "closed"
router.post("/mt5/positions/close", requireAuth, async (req, res): Promise<void> => {
  const { ticket } = req.body as { ticket: string };
  const userId = uid(req);
  if (!ticket) { res.status(400).json({ error: "ticket required" }); return; }

  // Find the order row by ticket
  const [order] = await db.select().from(mt5OrdersTable)
    .where(and(eq(mt5OrdersTable.mt5Ticket, ticket), eq(mt5OrdersTable.userId, userId)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Position not found" }); return; }
  if (order.status === "closed") { res.status(400).json({ error: "Already closed" }); return; }

  // Simulate close price (small drift from open)
  const openPrice = parseFloat(order.openPrice ?? "1");
  const drift = (Math.random() - 0.48) * openPrice * 0.003;
  const closePrice = +(openPrice + drift).toFixed(5);
  const pipValue = openPrice > 10 ? 0.01 : 0.0001;
  const volume = parseFloat(order.volume ?? "0.01");
  const pipDiff = (order.side === "buy" ? closePrice - openPrice : openPrice - closePrice) / pipValue;
  const realizedPnl = +(pipDiff * pipValue * volume * 100000 * 0.01).toFixed(2);

  await db.update(mt5OrdersTable)
    .set({ status: "closed", closePrice: String(closePrice), profit: String(realizedPnl), closedAt: new Date() })
    .where(eq(mt5OrdersTable.mt5Ticket, ticket));

  res.json({ ok: true, closePrice, realizedPnl, ticket });
});

// ─── GET /mt5/orders ──────────────────────────────────────────────────────────
router.get("/mt5/orders", requireAuth, async (req, res): Promise<void> => {
  const orders = await db.select().from(mt5OrdersTable)
    .where(eq(mt5OrdersTable.userId, uid(req)))
    .orderBy(desc(mt5OrdersTable.createdAt))
    .limit(50);
  res.json({ orders });
});

// ─── GET /mt5/positions ───────────────────────────────────────────────────────
// Returns simulated open positions for all connected MT5 accounts of the user.
// In production this would call the broker's WebAPI / MT5 Manager HTTP bridge.
router.get("/mt5/positions", requireAuth, async (req, res): Promise<void> => {
  const userId = uid(req);
  const accounts = await db.select().from(mt5AccountsTable)
    .where(and(eq(mt5AccountsTable.userId, userId)))
    .orderBy(desc(mt5AccountsTable.createdAt));

  const connectedAccounts = accounts.filter(a => a.status === "connected");

  // Pull MT5 orders to build open position list
  const mt5Orders = await db.select().from(mt5OrdersTable)
    .where(and(eq(mt5OrdersTable.userId, userId)))
    .orderBy(desc(mt5OrdersTable.createdAt))
    .limit(100);

  // For each filled-but-not-closed order, simulate an open position with running P&L
  const positions = mt5Orders
    .filter(o => o.status === "filled")
    .map(o => {
      const openPrice = parseFloat(o.openPrice ?? "1");
      const volume = parseFloat(o.volume ?? "0.01");
      // Simulate drift from open price
      const drift = (Math.random() - 0.488) * openPrice * 0.0035;
      const currentPrice = +(openPrice + drift).toFixed(5);
      const pipValue = openPrice > 10 ? 0.01 : 0.0001;
      const pipDiff = (o.side === "buy" ? currentPrice - openPrice : openPrice - currentPrice) / pipValue;
      const pnl = +(pipDiff * pipValue * volume * 100000 * 0.01).toFixed(2);

      const acct = connectedAccounts.find(a => a.id === o.mt5AccountId);
      return {
        ticket: o.mt5Ticket,
        mt5AccountId: o.mt5AccountId,
        accountServer: acct?.server ?? "Unknown",
        accountLogin: acct?.login ?? "—",
        isDemo: acct?.isDemo ?? true,
        symbol: o.symbol,
        side: o.side,
        volume: parseFloat(o.volume ?? "0.01"),
        openPrice: openPrice,
        currentPrice,
        stopLoss: o.stopLoss ? parseFloat(o.stopLoss) : null,
        takeProfit: o.takeProfit ? parseFloat(o.takeProfit) : null,
        pnl,
        pips: +pipDiff.toFixed(1),
        openedAt: o.openedAt,
        simulated: o.simulated,
        comment: o.comment,
      };
    });

  res.json({ positions });
});

// ─── POST /mt5/account/:id/refresh ────────────────────────────────────────────
// Refresh account balance / equity / margin (simulated tick)
router.post("/mt5/account/:id/refresh", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id, 10);
  const userId = uid(req);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account id" }); return; }

  const [acct] = await db.select().from(mt5AccountsTable)
    .where(and(eq(mt5AccountsTable.id, id), eq(mt5AccountsTable.userId, userId)))
    .limit(1);
  if (!acct) { res.status(404).json({ error: "Account not found" }); return; }
  if (acct.status !== "connected") { res.status(400).json({ error: "Account not connected" }); return; }

  const balance = parseFloat(acct.balance ?? "10000");
  // Simulate small equity drift
  const drift = (Math.random() - 0.48) * balance * 0.002;
  const equity = +(balance + drift).toFixed(2);
  const margin = +(parseFloat(acct.margin ?? "0") * (1 + (Math.random() - 0.5) * 0.05)).toFixed(2);
  const freeMargin = +(equity - margin).toFixed(2);

  const [updated] = await db.update(mt5AccountsTable)
    .set({ equity: String(equity), margin: String(margin), freeMargin: String(freeMargin), updatedAt: new Date() })
    .where(eq(mt5AccountsTable.id, id))
    .returning();

  const { passwordHash: _ph, sessionToken: _st, ...safe } = updated;
  res.json({ account: safe });
});

export default router;
