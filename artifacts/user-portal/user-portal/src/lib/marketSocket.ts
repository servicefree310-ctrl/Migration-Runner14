import { useEffect, useState } from "react";

export type NormalizedTicker = {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
  high: number;
  low: number;
  timestamp: number;
};

export type NormalizedTrade = {
  price: number;
  qty: number;
  side: "buy" | "sell";
  isBuyerMaker: boolean;
  ts: number;
};

export type NormalizedOrderbook = {
  bids: [number, number][];
  asks: [number, number][];
  timestamp?: number;
};

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

type Subscription = { type: "ticker" | "orderbook" | "trades" | "ohlcv" | "futures.orderbook"; symbol: string; limit?: number; interval?: string };

function subKey(s: Subscription): string {
  if (s.type === "ohlcv") return `ohlcv:${s.symbol}:${s.interval || "1m"}`;
  return `${s.type}:${s.symbol}`;
}

function streamKey(s: Subscription): string {
  if (s.type === "futures.orderbook") return `futures.orderbook:${s.symbol}`;
  if (s.type === "orderbook") return `orderbook:${s.symbol}`;
  if (s.type === "ohlcv") return `ohlcv:${s.symbol}:${s.interval || "1m"}`;
  if (s.type === "trades") return `trades:${s.symbol}`;
  return `ticker:${s.symbol}`;
}

function normalizeTicker(symbol: string, raw: any): NormalizedTicker {
  if (!raw) return { symbol, lastPrice: 0, priceChangePercent: 0, volume: 0, quoteVolume: 0, high: 0, low: 0, timestamp: 0 };
  const lastPrice = Number(raw.last ?? raw.lastPrice ?? 0);
  const pct = Number(raw.percentage ?? raw.change ?? raw.priceChangePercent ?? 0);
  const vol = Number(raw.baseVolume ?? raw.volume ?? 0);
  const quoteVol = Number(raw.quoteVolume ?? vol * lastPrice);
  return {
    symbol: raw.symbol || symbol,
    lastPrice,
    priceChangePercent: pct,
    volume: vol,
    quoteVolume: quoteVol,
    high: Number(raw.high ?? lastPrice),
    low: Number(raw.low ?? lastPrice),
    timestamp: Number(raw.timestamp ?? Date.now()),
  };
}

function normalizeTrade(raw: any): NormalizedTrade | null {
  if (!raw) return null;
  const price = Number(raw.price ?? 0);
  const qty = Number(raw.qty ?? raw.amount ?? 0);
  if (!(price > 0)) return null;
  const sideRaw = String(raw.side || raw.takerSide || "buy").toLowerCase();
  const side: "buy" | "sell" = sideRaw === "sell" ? "sell" : "buy";
  return { price, qty, side, isBuyerMaker: side === "sell", ts: Number(raw.ts ?? raw.timestamp ?? Date.now()) };
}

function normalizeOrderbook(raw: any): NormalizedOrderbook {
  const toLevels = (arr: any[]): [number, number][] =>
    Array.isArray(arr)
      ? arr
          .map((lv: any) => {
            if (Array.isArray(lv)) return [Number(lv[0]), Number(lv[1])] as [number, number];
            return [Number(lv?.price ?? 0), Number(lv?.qty ?? lv?.amount ?? 0)] as [number, number];
          })
          .filter(([p, q]) => p > 0 && q > 0)
      : [];
  return { bids: toLevels(raw?.bids), asks: toLevels(raw?.asks), timestamp: Number(raw?.timestamp ?? Date.now()) };
}

function normalizeCandles(raw: any): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => {
      if (Array.isArray(c)) {
        return { time: Math.floor(Number(c[0]) / 1000), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) };
      }
      return { time: Math.floor(Number(c.time ?? c.ts ?? 0) / 1000), open: Number(c.open ?? c.o), high: Number(c.high ?? c.h), low: Number(c.low ?? c.l), close: Number(c.close ?? c.c), volume: Number(c.volume ?? c.v ?? 0) };
    })
    .filter((c: Candle) => c.time > 0 && c.close > 0);
}

class MarketSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private backoff = 1000;
  private subs = new Map<string, Subscription>();
  private listeners = new Map<string, Set<(data: any) => void>>();
  private tickerListeners = new Set<(data: Record<string, NormalizedTicker>) => void>();
  private latestTickers: Record<string, NormalizedTicker> = {};
  private latestInrRate = 0;
  private inrRateListeners = new Set<(rate: number) => void>();
  private connected = false;
  private connectedListeners = new Set<(v: boolean) => void>();
  private closed = false;

  constructor() {
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost";
    this.url = `${protocol}//${host}/api/ws/prices`;
    if (typeof window !== "undefined") this.connect();
  }

  private connect() {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.backoff = 1000;
      if (!this.connected) { this.connected = true; this.connectedListeners.forEach(cb => cb(true)); }
      this.startPing();
      // Re-send all active subscriptions
      for (const sub of this.subs.values()) this.sendSub(sub);
    };
    this.ws.onmessage = (event) => {
      let payload: any;
      try { payload = JSON.parse(event.data); } catch { return; }
      this.handleMessage(payload);
    };
    this.ws.onclose = () => {
      if (this.connected) { this.connected = false; this.connectedListeners.forEach(cb => cb(false)); }
      this.cleanupTimers();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => { /* close handler will run */ };
  }

  private handleMessage(payload: any) {
    if (!payload || typeof payload !== "object") return;
    if (payload.action === "PONG") return;
    const stream = payload.stream as string | undefined;
    if (stream === "tickers" && payload.data) {
      const next: Record<string, NormalizedTicker> = { ...this.latestTickers };
      for (const [sym, raw] of Object.entries(payload.data)) {
        next[sym] = normalizeTicker(sym, raw);
      }
      this.latestTickers = next;
      for (const cb of this.tickerListeners) cb(next);
      return;
    }
    if (stream === "ticker" && payload.data) {
      const sym = payload.data.symbol || "";
      this.notify(`ticker:${sym}`, normalizeTicker(sym, payload.data));
      return;
    }
    if (typeof stream === "string" && stream.startsWith("trades:") && payload.data) {
      const arr = Array.isArray(payload.data) ? payload.data : [payload.data];
      const norm = arr.map(normalizeTrade).filter(Boolean) as NormalizedTrade[];
      if (norm.length === 0) return;
      this.notify(stream, norm);
      return;
    }
    // Backward-compat: server frame without symbol-scoped key.
    if (stream === "trades" && payload.data) {
      const sym = payload.symbol as string | undefined;
      const arr = Array.isArray(payload.data) ? payload.data : [payload.data];
      const norm = arr.map(normalizeTrade).filter(Boolean) as NormalizedTrade[];
      if (norm.length === 0) return;
      if (sym) {
        this.notify(`trades:${sym}`, norm);
      } else {
        for (const [key, set] of this.listeners) {
          if (!key.startsWith("trades:")) continue;
          for (const cb of set) cb(norm);
        }
      }
      return;
    }
    if (typeof stream === "string" && stream.startsWith("futures.orderbook:") && payload.data) {
      this.notify(stream, normalizeOrderbook(payload.data));
      return;
    }
    if (typeof stream === "string" && stream.startsWith("orderbook:") && payload.data) {
      this.notify(stream, normalizeOrderbook(payload.data));
      return;
    }
    if (typeof stream === "string" && stream.startsWith("ohlcv:") && payload.data) {
      this.notify(stream, normalizeCandles(payload.data));
      return;
    }
    // Initial snapshot frame: { type: "snapshot", inrRate, ticks }
    if (payload.type === "snapshot" && Array.isArray(payload.ticks)) {
      if (typeof payload.inrRate === "number" && payload.inrRate > 0) {
        this.latestInrRate = payload.inrRate;
        for (const cb of this.inrRateListeners) cb(this.latestInrRate);
      }
    }
  }

  private notify(stream: string, data: any) {
    const set = this.listeners.get(stream);
    if (!set) return;
    for (const cb of set) cb(data);
  }

  private sendSub(s: Subscription) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload: any = { type: s.type, symbol: s.symbol };
    if (s.limit) payload.limit = s.limit;
    if (s.interval) payload.interval = s.interval;
    try { this.ws.send(JSON.stringify({ action: "SUBSCRIBE", payload })); } catch {}
  }

  private sendUnsub(s: Subscription) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload: any = { type: s.type, symbol: s.symbol };
    if (s.interval) payload.interval = s.interval;
    try { this.ws.send(JSON.stringify({ action: "UNSUBSCRIBE", payload })); } catch {}
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ action: "PING" })); } catch {}
      }
    }, 25000);
  }

  private cleanupTimers() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 1.5, 30000);
      this.connect();
    }, this.backoff);
  }

  subscribe(sub: Subscription, cb: (data: any) => void): () => void {
    const stream = streamKey(sub);
    const key = subKey(sub);
    if (!this.listeners.has(stream)) this.listeners.set(stream, new Set());
    this.listeners.get(stream)!.add(cb);
    if (!this.subs.has(key)) {
      this.subs.set(key, sub);
      this.sendSub(sub);
    }
    return () => {
      const set = this.listeners.get(stream);
      if (set) {
        set.delete(cb);
        if (set.size === 0) {
          this.listeners.delete(stream);
          const existing = this.subs.get(key);
          if (existing) {
            this.sendUnsub(existing);
            this.subs.delete(key);
          }
        }
      }
    };
  }

  subscribeTickers(cb: (data: Record<string, NormalizedTicker>) => void): () => void {
    this.tickerListeners.add(cb);
    if (Object.keys(this.latestTickers).length > 0) cb(this.latestTickers);
    return () => { this.tickerListeners.delete(cb); };
  }

  private setConnected(v: boolean) {
    if (this.connected === v) return;
    this.connected = v;
    for (const cb of this.connectedListeners) cb(v);
  }

  isConnected() { return this.connected; }

  subscribeConnected(cb: (v: boolean) => void): () => void {
    this.connectedListeners.add(cb);
    cb(this.connected);
    return () => { this.connectedListeners.delete(cb); };
  }

  getLatestTickers() { return this.latestTickers; }
  getInrRate() { return this.latestInrRate; }

  subscribeInrRate(cb: (rate: number) => void): () => void {
    this.inrRateListeners.add(cb);
    if (this.latestInrRate > 0) cb(this.latestInrRate);
    return () => { this.inrRateListeners.delete(cb); };
  }
}

export const marketSocket = typeof window !== "undefined" ? new MarketSocket() : (null as any);

export function useWsConnected() {
  const [connected, setConnected] = useState<boolean>(() => marketSocket?.isConnected() ?? false);
  useEffect(() => {
    if (!marketSocket) return;
    return marketSocket.subscribeConnected(setConnected);
  }, []);
  return connected;
}

export function useInrRate() {
  const [rate, setRate] = useState<number>(() => marketSocket?.getInrRate() || 0);
  useEffect(() => {
    if (!marketSocket) return;
    return marketSocket.subscribeInrRate(setRate);
  }, []);
  return rate;
}

export function useTickers() {
  const [tickers, setTickers] = useState<Record<string, NormalizedTicker>>(() => marketSocket?.getLatestTickers() || {});
  useEffect(() => {
    if (!marketSocket) return;
    return marketSocket.subscribeTickers(setTickers);
  }, []);
  return tickers;
}

export function useTicker(symbol?: string) {
  const [ticker, setTicker] = useState<NormalizedTicker | null>(null);
  useEffect(() => {
    if (!symbol || !marketSocket) return;
    // Seed from bulk tickers cache so we have something immediately
    const seed = marketSocket.getLatestTickers()[symbol];
    if (seed) setTicker(seed);
    return marketSocket.subscribe({ type: "ticker", symbol }, setTicker);
  }, [symbol]);
  return ticker;
}

export function useOrderbook(symbol?: string, limit = 50) {
  const [orderbook, setOrderbook] = useState<NormalizedOrderbook>({ bids: [], asks: [] });
  useEffect(() => {
    if (!symbol || !marketSocket) return;
    return marketSocket.subscribe({ type: "orderbook", symbol, limit }, setOrderbook);
  }, [symbol, limit]);
  return orderbook;
}

export function useRecentTrades(symbol?: string, max = 50, seedUrl?: string) {
  const [trades, setTrades] = useState<NormalizedTrade[]>([]);

  // Seed from REST API on mount / symbol change so trades are always visible
  useEffect(() => {
    setTrades([]);
    if (!symbol) return;
    const [base, quote] = symbol.split("/");
    if (!base || !quote) return;
    let cancelled = false;
    const url = seedUrl ?? `/api/exchange/trades/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any) => {
        if (cancelled) return;
        const arr: any[] = Array.isArray(data) ? data
          : Array.isArray(data?.trades) ? data.trades : [];
        const norm = arr.map(normalizeTrade).filter(Boolean) as NormalizedTrade[];
        if (norm.length > 0) setTrades(norm.slice(0, max));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [symbol, max, seedUrl]);

  // WS subscription merges live prints on top — batched via rAF to avoid
  // per-trade React re-renders on busy markets.
  useEffect(() => {
    if (!symbol || !marketSocket) return;
    const bufRef: { buf: NormalizedTrade[]; raf: number | null } = { buf: [], raf: null };
    const flush = () => {
      const snapshot = bufRef.buf.slice(0, max);
      setTrades(snapshot);
      bufRef.raf = null;
    };
    const unsub = marketSocket.subscribe({ type: "trades", symbol }, (data: NormalizedTrade[]) => {
      const incoming = Array.isArray(data) ? data : [data];
      if (incoming.length >= max) {
        bufRef.buf = incoming.slice(0, max);
      } else {
        bufRef.buf = [...incoming, ...bufRef.buf].slice(0, max);
      }
      if (bufRef.raf === null) {
        bufRef.raf = requestAnimationFrame(flush);
      }
    });
    return () => {
      unsub?.();
      if (bufRef.raf !== null) cancelAnimationFrame(bufRef.raf);
    };
  }, [symbol, max]);

  return trades;
}

export function useOhlcv(symbol?: string, interval = "1h") {
  const [candles, setCandles] = useState<Candle[]>([]);
  // Reset immediately on symbol/interval change so stale candles from the
  // previous pair never get applied to the new pair's chart.
  useEffect(() => { setCandles([]); }, [symbol, interval]);
  useEffect(() => {
    if (!symbol || !marketSocket) return;
    return marketSocket.subscribe({ type: "ohlcv", symbol, interval }, setCandles);
  }, [symbol, interval]);
  return candles;
}

// URL helpers: pages use "/trade/BTC_INR" because wouter can't capture
// a slash in a single param. Convert at the API/WS boundary.
export function encodeSymbol(s: string): string {
  return s.replace("/", "_");
}

const KNOWN_QUOTES = ["USDT", "INR", "BTC", "ETH", "BNB", "BUSD"] as const;

export function decodeSymbol(s: string): string {
  if (s.includes("/")) return s;
  if (s.includes("_")) return s.replace("_", "/");
  if (s.includes("-")) return s.replace("-", "/");
  // Parse compact symbols like BTCUSDT → BTC/USDT, ETHINR → ETH/INR
  for (const q of KNOWN_QUOTES) {
    if (s.endsWith(q) && s.length > q.length) return `${s.slice(0, s.length - q.length)}/${q}`;
  }
  return s;
}
