// Per-symbol rolling tick history. Subscribes to the price-service stream
// and stores up to MAX_POINTS recent {ts, price} samples for both USDT
// and INR quotes per base coin. Used by the chart builder to synthesize
// realistic OHLCV candles when there are no real trades for that symbol.
import { subscribe, getCache } from "./price-service";

type Sample = { ts: number; price: number };

const MAX_POINTS = 4000; // ~66 minutes at 1s tick
const usdt = new Map<string, Sample[]>(); // key = base coin (BTC, ETH, ...)
const inr  = new Map<string, Sample[]>();

function pushSample(map: Map<string, Sample[]>, key: string, s: Sample) {
  let arr = map.get(key);
  if (!arr) { arr = []; map.set(key, arr); }
  // Ignore duplicate timestamps (price-service ticks at 1Hz).
  if (arr.length && arr[arr.length - 1].ts === s.ts) {
    arr[arr.length - 1] = s;
  } else {
    arr.push(s);
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
  }
}

export function getHistory(symbol: string): Sample[] {
  // symbol is "BASE/QUOTE" or "BASEQUOTE"; quote inferred.
  const s = (symbol || "").toUpperCase().replace("/", "");
  let base = s, quote = "USDT";
  if (s.endsWith("INR")) { base = s.slice(0, -3); quote = "INR"; }
  else if (s.endsWith("USDT")) { base = s.slice(0, -4); quote = "USDT"; }
  else if (s.endsWith("USD")) { base = s.slice(0, -3); quote = "USD"; }
  const map = quote === "INR" ? inr : usdt;
  return map.get(base) ?? [];
}

let started = false;
export function startPriceHistory() {
  if (started) return; started = true;
  // Seed with whatever the cache currently holds.
  const seedTs = Date.now();
  for (const t of getCache()) {
    if (!t || !t.symbol || t.symbol === "USDT" || t.symbol === "INR") continue;
    if (Number(t.usdt) > 0) pushSample(usdt, t.symbol, { ts: seedTs, price: Number(t.usdt) });
    if (Number(t.inr)  > 0) pushSample(inr,  t.symbol, { ts: seedTs, price: Number(t.inr)  });
  }
  subscribe((ticks) => {
    const now = Date.now();
    for (const t of ticks) {
      if (!t || !t.symbol || t.symbol === "USDT" || t.symbol === "INR") continue;
      const u = Number(t.usdt); const i = Number(t.inr);
      if (u > 0) pushSample(usdt, t.symbol, { ts: now, price: u });
      if (i > 0) pushSample(inr,  t.symbol, { ts: now, price: i });
    }
  });
}
