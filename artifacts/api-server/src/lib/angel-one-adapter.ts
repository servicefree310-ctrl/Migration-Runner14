/**
 * Angel One SmartAPI Adapter
 *
 * Provides a unified interface for broker operations.
 * When API keys are configured → real Angel One calls.
 * When not configured (sandbox mode) → returns simulated prices with realistic drift.
 *
 * Angel One SmartAPI docs: https://smartapi.angelbroking.com/docs
 */

import { db, brokerConfigTable, instrumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface BrokerQuote {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: Date;
}

export interface BrokerOrderResult {
  brokerOrderId: string;
  status: "placed" | "rejected" | "pending";
  message?: string;
}

let _configCache: typeof brokerConfigTable.$inferSelect | null = null;
let _configCachedAt = 0;

async function getBrokerConfig() {
  const now = Date.now();
  if (_configCache && now - _configCachedAt < 60_000) return _configCache;
  const [cfg] = await db.select().from(brokerConfigTable).limit(1);
  _configCache = cfg ?? null;
  _configCachedAt = now;
  return _configCache;
}

export function invalidateBrokerConfigCache() {
  _configCache = null;
  _configCachedAt = 0;
}

// ─── Simulated price engine ──────────────────────────────────────────────────
// When no broker is configured, we simulate realistic price movements
// based on seeded base prices with small random drift.

const _simPrices = new Map<string, { price: number; lastTick: number }>();

function simPrice(symbol: string, base: number): number {
  const now = Date.now();
  let entry = _simPrices.get(symbol);
  if (!entry) {
    entry = { price: base, lastTick: now };
    _simPrices.set(symbol, entry);
  }
  // Drift every ~5 seconds
  const elapsedSec = (now - entry.lastTick) / 1000;
  if (elapsedSec > 5) {
    const ticks = Math.floor(elapsedSec / 5);
    for (let i = 0; i < ticks; i++) {
      const drift = (Math.random() - 0.498) * 0.0008;
      entry.price = entry.price * (1 + drift);
    }
    entry.lastTick = now;
  }
  return parseFloat(entry.price.toFixed(8));
}

export async function getQuote(symbol: string): Promise<BrokerQuote | null> {
  const [instrument] = await db
    .select()
    .from(instrumentsTable)
    .where(eq(instrumentsTable.symbol, symbol))
    .limit(1);

  if (!instrument) return null;

  const cfg = await getBrokerConfig();

  if (cfg?.enabled && !cfg.sandboxMode && cfg.jwtToken) {
    // ── Real Angel One SmartAPI call ──────────────────────────────────────
    // POST https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/
    // { mode: "FULL", exchangeTokens: { "NSE": [brokerToken] } }
    try {
      const exchangeTokens: Record<string, string[]> = {};
      const exch = instrument.exchange.toUpperCase();
      const tok = instrument.brokerToken ?? instrument.brokerSymbol ?? symbol;
      exchangeTokens[exch] = [tok];

      const resp = await fetch(
        "https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.jwtToken}`,
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "192.168.1.1",
            "X-ClientPublicIP": "106.193.147.98",
            "X-MACAddress": "fe80::216e:6507:4b90:3719",
            "X-PrivateKey": cfg.apiKey ?? "",
          },
          body: JSON.stringify({ mode: "FULL", exchangeTokens }),
          signal: AbortSignal.timeout(5000),
        },
      );
      const json = (await resp.json()) as {
        status: boolean;
        data?: { fetched?: Array<{ ltp: number; open: number; high: number; low: number; close: number; tradeVolume: number; netChange: number; percentChange: number }> };
      };
      if (json.status && json.data?.fetched?.[0]) {
        const d = json.data.fetched[0];
        await db
          .update(instrumentsTable)
          .set({ currentPrice: String(d.ltp), high24h: String(d.high), low24h: String(d.low), change24h: String(d.percentChange), priceUpdatedAt: new Date() })
          .where(eq(instrumentsTable.symbol, symbol));
        return {
          symbol,
          ltp: d.ltp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          change: d.netChange,
          changePct: d.percentChange,
          volume: d.tradeVolume,
          timestamp: new Date(),
        };
      }
    } catch {
      // Fall through to simulated
    }
  }

  // ── Simulated mode ────────────────────────────────────────────────────────
  const base = Number(instrument.manualPrice ?? instrument.currentPrice);
  const ltp = simPrice(symbol, base > 0 ? base : 100);
  const prev = Number(instrument.previousClose) || ltp;
  const change = ltp - prev;
  const changePct = prev > 0 ? (change / prev) * 100 : 0;
  const high = ltp * (1 + Math.random() * 0.005);
  const low = ltp * (1 - Math.random() * 0.005);

  return {
    symbol,
    ltp,
    open: prev,
    high,
    low,
    close: prev,
    change,
    changePct,
    volume: Math.floor(Math.random() * 1_000_000),
    timestamp: new Date(),
  };
}

export async function placeOrder(params: {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price?: number;
  type: "MARKET" | "LIMIT" | "STOPLOSS";
  brokerToken: string;
  exchange: string;
}): Promise<BrokerOrderResult> {
  const cfg = await getBrokerConfig();

  if (cfg?.enabled && !cfg.sandboxMode && cfg.jwtToken) {
    try {
      const body = {
        variety: "NORMAL",
        tradingsymbol: params.symbol,
        symboltoken: params.brokerToken,
        transactiontype: params.side,
        exchange: params.exchange,
        ordertype: params.type,
        producttype: "INTRADAY",
        duration: "DAY",
        price: params.price?.toFixed(2) ?? "0",
        squareoff: "0",
        stoploss: "0",
        quantity: String(params.qty),
      };
      const resp = await fetch(
        "https://apiconnect.angelbroking.com/rest/secure/angelbroking/order/v1/placeOrder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.jwtToken}`,
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "192.168.1.1",
            "X-ClientPublicIP": "106.193.147.98",
            "X-MACAddress": "fe80::216e:6507:4b90:3719",
            "X-PrivateKey": cfg.apiKey ?? "",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        },
      );
      const json = (await resp.json()) as { status: boolean; data?: { orderid: string }; message?: string };
      if (json.status && json.data?.orderid) {
        return { brokerOrderId: json.data.orderid, status: "placed" };
      }
      return { brokerOrderId: "", status: "rejected", message: json.message };
    } catch (err) {
      return { brokerOrderId: "", status: "rejected", message: String(err) };
    }
  }

  // Simulated: auto-fill immediately
  return {
    brokerOrderId: `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: "placed",
    message: "Simulated order (sandbox mode)",
  };
}

export async function loginAngelOne(params: {
  clientId: string;
  apiKey: string;
  password: string;
  totp: string;
}): Promise<{ jwtToken: string; refreshToken: string; feedToken: string } | null> {
  try {
    const resp = await fetch(
      "https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "192.168.1.1",
          "X-ClientPublicIP": "106.193.147.98",
          "X-MACAddress": "fe80::216e:6507:4b90:3719",
          "X-PrivateKey": params.apiKey,
        },
        body: JSON.stringify({
          clientcode: params.clientId,
          password: params.password,
          totp: params.totp,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const json = (await resp.json()) as { status: boolean; data?: { jwtToken: string; refreshToken: string; feedToken: string } };
    if (json.status && json.data) return json.data;
    return null;
  } catch {
    return null;
  }
}
