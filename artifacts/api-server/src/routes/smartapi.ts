/**
 * Angel One SmartAPI Integration
 *
 * Architecture:
 *   - ADMIN configures the platform-level API Key once via /admin/broker-config
 *   - USERS connect only with their own clientCode + password + TOTP
 *   - The platform API Key is read from broker_config table — users never see it
 *
 *   POST   /smartapi/connect          — user connects with clientCode + password + totp
 *   POST   /smartapi/disconnect       — clear tokens, logout
 *   POST   /smartapi/refresh          — refresh JWT using refreshToken
 *   GET    /smartapi/account          — get user's connected SmartAPI account(s)
 *   GET    /smartapi/profile          — Angel One user profile
 *   GET    /smartapi/funds            — available funds / margin
 *   GET    /smartapi/holdings         — equity holdings with P&L
 *   GET    /smartapi/positions        — open intraday / carryforward positions
 *   GET    /smartapi/orders           — order book (today)
 *   POST   /smartapi/orders           — place a new order
 *   DELETE /smartapi/orders/:orderId  — cancel an order
 *   GET    /smartapi/quote            — LTP / OHLC for a scrip
 *   GET    /smartapi/search           — search scrip by name/symbol
 *   GET    /smartapi/tradebook        — today's executed trades
 *   GET    /smartapi/platform-status  — check if admin has configured the API key
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, smartApiAccountsTable, brokerConfigTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const SMARTAPI_BASE = "https://apiconnect.angelone.in";

function uid(req: any): number { return req.user!.id; }

// ─── Fetch platform API key from broker_config (set by admin) ─────────────────
async function getPlatformApiKey(): Promise<string | null> {
  const [config] = await db.select({ apiKey: brokerConfigTable.apiKey, enabled: brokerConfigTable.enabled })
    .from(brokerConfigTable)
    .where(eq(brokerConfigTable.broker, "angelone"))
    .limit(1);
  return config?.apiKey ?? null;
}

// ─── SmartAPI HTTP helper ──────────────────────────────────────────────────────
async function smartCall(
  path: string,
  method: "GET" | "POST" | "DELETE",
  apiKey: string,
  jwtToken: string,
  body?: object,
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(`${SMARTAPI_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${jwtToken}`,
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "106.193.147.98",
        "X-MACAddress": "fe80::216e:6507:4b90:3719",
        "X-PrivateKey": apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 503, data: { message: err.message } };
  }
}

// ─── GET /smartapi/platform-status ────────────────────────────────────────────
// Lets the UI know if admin has configured the platform API key
router.get("/smartapi/platform-status", requireAuth, async (_req, res): Promise<void> => {
  const apiKey = await getPlatformApiKey();
  res.json({ configured: !!apiKey, hint: apiKey ? apiKey.slice(0, 4) + "****" : null });
});

// ─── POST /smartapi/connect ────────────────────────────────────────────────────
// User provides only their own Angel One credentials — API Key comes from admin config
router.post("/smartapi/connect", requireAuth, async (req, res): Promise<void> => {
  const { clientCode, password, totp } = req.body as {
    clientCode: string; password: string; totp: string;
  };
  const userId = uid(req);

  if (!clientCode || !password) {
    res.status(400).json({ error: "clientCode and password are required" });
    return;
  }

  // Fetch platform API key from admin config
  const apiKey = await getPlatformApiKey();
  if (!apiKey) {
    res.status(503).json({
      error: "SmartAPI not configured",
      detail: "Admin ne platform API Key configure nahi ki hai. Admin se contact karein.",
    });
    return;
  }

  // Call Angel One login with PLATFORM api key + USER credentials
  const loginRes = await fetch(`${SMARTAPI_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "106.193.147.98",
      "X-MACAddress": "fe80::216e:6507:4b90:3719",
      "X-PrivateKey": apiKey,
    },
    body: JSON.stringify({ clientcode: clientCode.trim().toUpperCase(), password, totp: totp ?? "" }),
  });

  const loginData = await loginRes.json().catch(() => ({}) as any) as any;

  if (!loginRes.ok || loginData.status === false || !loginData.data?.jwtToken) {
    res.status(401).json({ error: loginData.message ?? "SmartAPI login failed", raw: loginData });
    return;
  }

  const tokens = loginData.data;
  const jwtExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // ~24h

  // Fetch user profile
  const profileRes = await smartCall(
    "/rest/secure/angelbroking/user/v1/getProfile",
    "GET", apiKey, tokens.jwtToken,
  );
  const profile = profileRes.data?.data ?? {};

  // Upsert account (store the platform apiKey alongside user tokens — needed for subsequent calls)
  const existing = await db.select({ id: smartApiAccountsTable.id })
    .from(smartApiAccountsTable)
    .where(and(eq(smartApiAccountsTable.userId, userId), eq(smartApiAccountsTable.clientCode, clientCode.trim().toUpperCase())))
    .limit(1);

  const upsertData = {
    apiKey,                            // platform key — stored for subsequent calls, NOT shown to user
    jwtToken: tokens.jwtToken,
    refreshToken: tokens.refreshToken,
    feedToken: tokens.feedToken,
    jwtExpiresAt,
    name: profile.name ?? null,
    email: profile.email ?? null,
    mobile: profile.mobileNo ?? null,
    pan: profile.pan ?? null,
    status: "connected" as const,
    lastError: null,
    lastConnectedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(smartApiAccountsTable).set(upsertData).where(eq(smartApiAccountsTable.id, existing[0].id));
  } else {
    await db.insert(smartApiAccountsTable).values({
      userId,
      clientCode: clientCode.trim().toUpperCase(),
      ...upsertData,
    });
  }

  res.json({
    ok: true,
    message: `Connected as ${profile.name ?? clientCode}`,
    profile: { name: profile.name, email: profile.email, pan: profile.pan, mobile: profile.mobileNo },
  });
});

// ─── POST /smartapi/disconnect ─────────────────────────────────────────────────
router.post("/smartapi/disconnect", requireAuth, async (req, res): Promise<void> => {
  const { accountId } = req.body as { accountId: number };
  const userId = uid(req);

  const [acct] = await db.select().from(smartApiAccountsTable)
    .where(and(eq(smartApiAccountsTable.id, accountId), eq(smartApiAccountsTable.userId, userId)))
    .limit(1);
  if (!acct) { res.status(404).json({ error: "Account not found" }); return; }

  if (acct.jwtToken && acct.apiKey) {
    await smartCall(
      "/rest/secure/angelbroking/user/v1/logout",
      "POST", acct.apiKey, acct.jwtToken,
      { clientcode: acct.clientCode },
    ).catch(() => {});
  }

  await db.update(smartApiAccountsTable)
    .set({ status: "disconnected", jwtToken: null, refreshToken: null, feedToken: null, updatedAt: new Date() })
    .where(eq(smartApiAccountsTable.id, accountId));

  res.json({ ok: true });
});

// ─── POST /smartapi/refresh ────────────────────────────────────────────────────
router.post("/smartapi/refresh", requireAuth, async (req, res): Promise<void> => {
  const { accountId } = req.body as { accountId: number };
  const userId = uid(req);

  const [acct] = await db.select().from(smartApiAccountsTable)
    .where(and(eq(smartApiAccountsTable.id, accountId), eq(smartApiAccountsTable.userId, userId)))
    .limit(1);
  if (!acct?.refreshToken) { res.status(400).json({ error: "No refresh token available" }); return; }

  // Use stored platform key
  const effectiveApiKey = acct.apiKey || await getPlatformApiKey() || "";

  const r = await fetch(`${SMARTAPI_BASE}/rest/auth/angelbroking/jwt/v1/generateTokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${acct.jwtToken}`,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "106.193.147.98",
      "X-MACAddress": "fe80::216e:6507:4b90:3719",
      "X-PrivateKey": effectiveApiKey,
    },
    body: JSON.stringify({ refreshToken: acct.refreshToken }),
  });
  const data = await r.json().catch(() => ({}) as any) as any;
  if (!data.data?.jwtToken) {
    res.status(401).json({ error: "Token refresh failed", raw: data });
    return;
  }

  const jwtExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.update(smartApiAccountsTable)
    .set({ jwtToken: data.data.jwtToken, refreshToken: data.data.refreshToken, feedToken: data.data.feedToken, jwtExpiresAt, updatedAt: new Date() })
    .where(eq(smartApiAccountsTable.id, accountId));

  res.json({ ok: true, message: "Token refreshed" });
});

// ─── Helper: get user's account (with effective API key) ──────────────────────
async function getAccount(userId: number, accountId?: number) {
  const [acct] = await db.select().from(smartApiAccountsTable)
    .where(accountId
      ? and(eq(smartApiAccountsTable.userId, userId), eq(smartApiAccountsTable.id, accountId))
      : eq(smartApiAccountsTable.userId, userId))
    .limit(1);
  if (!acct) return null;

  // If stored apiKey is missing, fall back to platform key
  const effectiveApiKey = acct.apiKey || await getPlatformApiKey() || "";
  return { ...acct, apiKey: effectiveApiKey };
}

// ─── GET /smartapi/account ─────────────────────────────────────────────────────
router.get("/smartapi/account", requireAuth, async (req, res): Promise<void> => {
  const accounts = await db.select().from(smartApiAccountsTable)
    .where(eq(smartApiAccountsTable.userId, uid(req)));

  const safe = accounts.map(({ jwtToken, refreshToken, feedToken, apiKey, ...rest }) => ({
    ...rest,
    hasToken: !!jwtToken,
    hasFeedToken: !!feedToken,
  }));
  res.json({ accounts: safe });
});

// ─── GET /smartapi/profile ─────────────────────────────────────────────────────
router.get("/smartapi/profile", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/user/v1/getProfile", "GET", acct.apiKey, acct.jwtToken);
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/funds ──────────────────────────────────────────────────────
router.get("/smartapi/funds", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/user/v1/getRMS", "GET", acct.apiKey, acct.jwtToken);
  if (r.ok && r.data?.data?.net) {
    await db.update(smartApiAccountsTable)
      .set({ availableCash: String(r.data.data.net), updatedAt: new Date() })
      .where(eq(smartApiAccountsTable.id, acct.id));
  }
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/holdings ────────────────────────────────────────────────────
router.get("/smartapi/holdings", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/portfolio/v1/getAllHolding", "GET", acct.apiKey, acct.jwtToken);
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/positions ───────────────────────────────────────────────────
router.get("/smartapi/positions", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/order/v1/getPosition", "GET", acct.apiKey, acct.jwtToken);
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/orders ──────────────────────────────────────────────────────
router.get("/smartapi/orders", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/order/v1/getOrderBook", "GET", acct.apiKey, acct.jwtToken);
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── POST /smartapi/orders ─────────────────────────────────────────────────────
router.post("/smartapi/orders", requireAuth, async (req, res): Promise<void> => {
  const {
    accountId,
    variety = "NORMAL",
    tradingsymbol, symboltoken, transactiontype, exchange,
    ordertype, producttype, duration = "DAY",
    price = "0", squareoff = "0", stoploss = "0", quantity,
  } = req.body as {
    accountId: number; variety?: string; tradingsymbol: string; symboltoken: string;
    transactiontype: string; exchange: string; ordertype: string; producttype: string;
    duration?: string; price?: string; squareoff?: string; stoploss?: string; quantity: string;
  };

  const acct = await getAccount(uid(req), accountId);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }

  const r = await smartCall(
    "/rest/secure/angelbroking/order/v1/placeOrder",
    "POST", acct.apiKey, acct.jwtToken,
    { variety, tradingsymbol, symboltoken, transactiontype, exchange, ordertype, producttype, duration, price, squareoff, stoploss, quantity },
  );
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── DELETE /smartapi/orders/:orderId ─────────────────────────────────────────
router.delete("/smartapi/orders/:orderId", requireAuth, async (req, res): Promise<void> => {
  const { orderId } = req.params;
  const { accountId, variety = "NORMAL" } = req.body as { accountId: number; variety?: string };
  const acct = await getAccount(uid(req), accountId);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall(
    "/rest/secure/angelbroking/order/v1/cancelOrder",
    "POST", acct.apiKey, acct.jwtToken,
    { variety, orderid: orderId },
  );
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/quote ──────────────────────────────────────────────────────
router.get("/smartapi/quote", requireAuth, async (req, res): Promise<void> => {
  const { exchange, symboltoken, mode = "FULL" } = req.query as Record<string, string>;
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall(
    "/rest/secure/angelbroking/market/v1/quote/",
    "POST", acct.apiKey, acct.jwtToken,
    { mode, exchangeTokens: { [exchange]: [symboltoken] } },
  );
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/search ─────────────────────────────────────────────────────
router.get("/smartapi/search", requireAuth, async (req, res): Promise<void> => {
  const { query: searchscrip, exchange = "NSE" } = req.query as Record<string, string>;
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall(
    "/rest/secure/angelbroking/order/v1/searchScrip",
    "POST", acct.apiKey, acct.jwtToken,
    { exchange, searchscrip },
  );
  res.status(r.ok ? 200 : r.status).json(r.data);
});

// ─── GET /smartapi/tradebook ──────────────────────────────────────────────────
router.get("/smartapi/tradebook", requireAuth, async (req, res): Promise<void> => {
  const acct = await getAccount(uid(req), req.query.accountId ? Number(req.query.accountId) : undefined);
  if (!acct?.jwtToken) { res.status(404).json({ error: "No connected SmartAPI account" }); return; }
  const r = await smartCall("/rest/secure/angelbroking/order/v1/getTradeBook", "GET", acct.apiKey, acct.jwtToken);
  res.status(r.ok ? 200 : r.status).json(r.data);
});

export default router;
