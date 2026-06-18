// Server-wide OHLCV cache. Across all WS connections we want at most ONE
// in-flight buildChart() call per (symbol, interval). Frames are cached for
// `staleMs` ms and fanned out to every subscriber. This avoids the obvious
// DoS / DB hammering vector where many clients watching the same chart each
// trigger their own DB rebuild every 2s.
//
// Contract: buildAndCache() always returns the freshest available candles
// (cached if not stale; otherwise rebuilds and updates cache). Concurrent
// callers for the same key share the in-flight promise — no thundering herd.

import { buildChart } from "../routes/bicrypto";

const ALLOWED_INTERVALS = new Set([
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
]);

export function isAllowedInterval(interval: string): boolean {
  return ALLOWED_INTERVALS.has(interval);
}

type Entry = {
  candles: number[][];
  ts: number;
  inflight?: Promise<number[][]>;
};

const cache = new Map<string, Entry>();
const STALE_MS = 800; // a touch under the 1s push cadence

function keyOf(symbol: string, interval: string, limit: number) {
  return `${symbol}|${interval}|${limit}`;
}

export async function getOhlcv(
  symbol: string,
  interval: string,
  limit = 200,
): Promise<number[][]> {
  if (!isAllowedInterval(interval)) {
    throw new Error(`unsupported interval: ${interval}`);
  }
  const key = keyOf(symbol, interval, limit);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < STALE_MS && !hit.inflight) return hit.candles;
  if (hit?.inflight) return hit.inflight;

  const p = (async () => {
    try {
      const candles = await buildChart(symbol, interval, limit);
      cache.set(key, { candles, ts: Date.now() });
      return candles;
    } finally {
      const e = cache.get(key);
      if (e) e.inflight = undefined;
    }
  })();

  cache.set(key, { candles: hit?.candles ?? [], ts: hit?.ts ?? 0, inflight: p });
  return p;
}
