/**
 * Black-Scholes pricing + greeks for European-style crypto options.
 *
 * Inputs are plain numbers in their natural units:
 *   spot          USD price of the underlying  (e.g. 65000 for BTC)
 *   strike        USD strike price             (e.g. 60000)
 *   ttYears       time to expiry in YEARS      (e.g. 7/365 for a weekly)
 *   iv            implied vol as a decimal     (0.80 = 80%)
 *   r             risk-free rate as a decimal  (0.05 = 5%)
 *   type          'call' | 'put'
 *
 * Returns a single object with `mark` (per-contract premium in USD) and the
 * five greeks. Greeks use standard textbook conventions:
 *   delta     ∂price/∂spot                  (calls 0..1, puts -1..0)
 *   gamma     ∂²price/∂spot²                (always positive, same for C/P)
 *   theta     ∂price/∂t  (per CALENDAR DAY, negative for both long C and long P)
 *   vega      ∂price/∂σ  (per 1 vol point = 0.01 change)
 *   rho       ∂price/∂r  (per 1 rate point  = 0.01 change)
 *
 * Edge cases: if ttYears <= 0 we return intrinsic + zero greeks; if iv <= 0
 * we floor to 0.0001 to avoid div-by-zero. Negative spot/strike returns NaN.
 */
export type OptionType = "call" | "put";

export interface OptionGreeks {
  mark: number;
  delta: number;
  gamma: number;
  theta: number;   // per calendar day
  vega: number;    // per 1 vol point (0.01)
  rho: number;     // per 1 rate point (0.01)
  intrinsic: number;
  timeValue: number;
}

// Abramowitz & Stegun 26.2.17 — accurate to ~7e-8
function normCdf(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function priceOption(
  spot: number,
  strike: number,
  ttYears: number,
  iv: number,
  r: number,
  type: OptionType,
): OptionGreeks {
  const intrinsic = Math.max(0, type === "call" ? spot - strike : strike - spot);
  // Expired: no time value, no greeks
  if (ttYears <= 0 || !isFinite(ttYears)) {
    return { mark: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, intrinsic, timeValue: 0 };
  }
  const sigma = Math.max(0.0001, iv);
  const sqrtT = Math.sqrt(ttYears);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * ttYears) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const nD1 = normPdf(d1);
  const discount = Math.exp(-r * ttYears);

  let mark: number, delta: number, theta: number, rho: number;
  if (type === "call") {
    mark  = spot * Nd1 - strike * discount * Nd2;
    delta = Nd1;
    theta = (-spot * nD1 * sigma) / (2 * sqrtT) - r * strike * discount * Nd2;
    rho   = strike * ttYears * discount * Nd2 / 100;
  } else {
    mark  = strike * discount * (1 - Nd2) - spot * (1 - Nd1);
    delta = Nd1 - 1;
    theta = (-spot * nD1 * sigma) / (2 * sqrtT) + r * strike * discount * (1 - Nd2);
    rho   = -strike * ttYears * discount * (1 - Nd2) / 100;
  }
  const gamma = nD1 / (spot * sigma * sqrtT);
  const vega  = spot * nD1 * sqrtT / 100;
  const thetaDaily = theta / 365;
  const finalMark = Math.max(intrinsic, mark); // guard against tiny negatives near expiry

  return {
    mark: finalMark,
    delta,
    gamma,
    theta: thetaDaily,
    vega,
    rho,
    intrinsic,
    timeValue: Math.max(0, finalMark - intrinsic),
  };
}

/**
 * Bps→decimal helpers used by route/engine layers — all admin-configured fields
 * on option_contracts are stored in basis points (10000 = 100%) for clean ints.
 */
export function bpsToDec(bps: number): number {
  return bps / 10000;
}

/**
 * Compute fractional years between now and an ISO timestamp (or Date). Negative
 * if the moment has passed.
 */
export function yearsTo(expiry: Date | string): number {
  const t = typeof expiry === "string" ? new Date(expiry).getTime() : expiry.getTime();
  const ms = t - Date.now();
  return ms / (365.25 * 24 * 3600 * 1000);
}
