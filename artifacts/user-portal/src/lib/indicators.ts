/**
 * Pure indicator helpers — RSI, MACD, Bollinger Bands, EMA, VWAP, Stochastic.
 * No charting library types here so consumers can freely shape values for
 * lightweight-charts (`{ time, value }` pairs).
 */
export type Bar = { time: number; close: number };
export type BarFull = { time: number; high: number; low: number; close: number; volume: number };
export type LinePt = { time: number; value: number };

/** Wilder's smoothed RSI (period default 14). */
export function rsi(values: Bar[], period = 14): LinePt[] {
  if (values.length <= period) return [];
  const out: LinePt[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i].close - values[i - 1].close;
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out.push({ time: values[period].time, value: 100 - 100 / (1 + (avgGain / Math.max(avgLoss, 1e-12))) });
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i].close - values[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: values[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

/** EMA — seeded with SMA for the first period bars. Exported for overlay use. */
export function ema(values: Bar[], period: number): LinePt[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePt[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i].close;
  let prev = sum / period;
  out.push({ time: values[period - 1].time, value: prev });
  for (let i = period; i < values.length; i++) {
    prev = values[i].close * k + prev * (1 - k);
    out.push({ time: values[i].time, value: prev });
  }
  return out;
}

export type MacdPoint = { time: number; macd: number; signal: number; hist: number };
/** MACD (12/26/9 standard). Returns rows where all three lines exist. */
export function macd(values: Bar[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  if (values.length < slow + signal) return [];
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const slowMap = new Map(slowE.map((p) => [p.time, p.value]));
  const macdLine: Bar[] = [];
  for (const p of fastE) {
    const s = slowMap.get(p.time);
    if (s === undefined) continue;
    macdLine.push({ time: p.time, close: p.value - s });
  }
  const signalLine = ema(macdLine, signal);
  const sigMap = new Map(signalLine.map((p) => [p.time, p.value]));
  const out: MacdPoint[] = [];
  for (const m of macdLine) {
    const s = sigMap.get(m.time);
    if (s === undefined) continue;
    out.push({ time: m.time, macd: m.close, signal: s, hist: m.close - s });
  }
  return out;
}

export type BBands = { time: number; upper: number; middle: number; lower: number };
/** Bollinger Bands (20-period SMA ± 2σ). */
export function bollinger(values: Bar[], period = 20, stdDev = 2): BBands[] {
  if (values.length < period) return [];
  const out: BBands[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j].close;
    const mean = sum / period;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = values[j].close - mean; varSum += d * d; }
    const sd = Math.sqrt(varSum / period);
    out.push({ time: values[i].time, middle: mean, upper: mean + stdDev * sd, lower: mean - stdDev * sd });
  }
  return out;
}

/** VWAP — Volume Weighted Average Price, resets at each UTC trading day. */
export function vwap(values: BarFull[]): LinePt[] {
  if (values.length === 0) return [];
  const out: LinePt[] = [];
  let cumPV = 0, cumVol = 0, lastDay = -1;
  for (const bar of values) {
    const day = Math.floor(bar.time / 86400);
    if (day !== lastDay) { cumPV = 0; cumVol = 0; lastDay = day; }
    const typical = (bar.high + bar.low + bar.close) / 3;
    cumPV += typical * bar.volume;
    cumVol += bar.volume;
    if (cumVol > 0) out.push({ time: bar.time, value: cumPV / cumVol });
  }
  return out;
}

export type StochPoint = { time: number; k: number; d: number };
/** Stochastic Oscillator (%K / %D). */
export function stochastic(values: BarFull[], kPeriod = 14, dPeriod = 3): StochPoint[] {
  if (values.length < kPeriod) return [];
  const kLine: { time: number; k: number }[] = [];
  for (let i = kPeriod - 1; i < values.length; i++) {
    let highest = -Infinity, lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (values[j].high > highest) highest = values[j].high;
      if (values[j].low < lowest) lowest = values[j].low;
    }
    const range = highest - lowest;
    kLine.push({ time: values[i].time, k: range === 0 ? 50 : ((values[i].close - lowest) / range) * 100 });
  }
  if (kLine.length < dPeriod) return [];
  const out: StochPoint[] = [];
  for (let i = dPeriod - 1; i < kLine.length; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) sum += kLine[j].k;
    out.push({ time: kLine[i].time, k: kLine[i].k, d: sum / dPeriod });
  }
  return out;
}
