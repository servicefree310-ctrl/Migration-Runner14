import type { NormalizedTicker } from "@/lib/marketSocket";

export type UsdRates = Record<string, number>;

// Build a "<quote-asset> -> USD" rate table from the live tickers.
// Without this, summing or sorting by `quoteVolume` mixes INR rupees
// with USDT dollars (and BTC, ETH etc.) as raw numbers, which is
// meaningless. The rate table lets us project every pair's
// quoteVolume into a single currency (USD) before aggregating.
export function buildUsdRates(tickers: NormalizedTicker[]): UsdRates {
  const rates: UsdRates = {
    USDT: 1, USDC: 1, USD: 1, BUSD: 1, DAI: 1, TUSD: 1, FDUSD: 1,
  };
  // Crypto -> USD from any <asset>/USDT|USDC|USD pair.
  for (const t of tickers) {
    const [base, quote] = t.symbol.split("/");
    if (!base || !quote) continue;
    const B = base.toUpperCase();
    const Q = quote.toUpperCase();
    if (rates[B]) continue;
    if ((Q === "USDT" || Q === "USDC" || Q === "USD") && t.lastPrice > 0) {
      rates[B] = t.lastPrice;
    }
  }
  // INR -> USD: prefer live USDT/INR rate, fall back to ~83.
  const usdtInr = tickers.find(
    (t) => t.symbol.toUpperCase().replace("/", "") === "USDTINR" && t.lastPrice > 0,
  );
  rates["INR"] = usdtInr ? 1 / usdtInr.lastPrice : 1 / 83;
  return rates;
}

// Project a ticker's quoteVolume into USD. Returns 0 for unknown
// quote assets so unrecognised pairs don't silently mis-sum.
export function quoteVolUsd(ticker: NormalizedTicker, rates: UsdRates): number {
  const vol = ticker.quoteVolume || 0;
  if (!vol) return 0;
  const quote = ticker.symbol.split("/")[1]?.toUpperCase() || "";
  const rate = rates[quote];
  return rate ? vol * rate : 0;
}
