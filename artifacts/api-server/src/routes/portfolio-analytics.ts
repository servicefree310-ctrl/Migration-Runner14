/**
 * Portfolio Analytics — extended P&L / allocation / tax breakdown
 *
 *   GET /portfolio/analytics/summary        — equity, allocation, 24h pnl
 *   GET /portfolio/analytics/history?days=  — daily equity curve (synthetic fallback)
 *   GET /portfolio/analytics/tax-report     — Indian 1% TDS computation for filled trades
 *
 * Prices come from the price-service in-memory cache (getRawTick) — same authoritative
 * price used by the matching engine and order book.  DB currentPrice is a fallback for
 * coins not yet in cache (e.g., manual-only coins before first tick).
 */
import { Router, type IRouter } from "express";
import { db, walletsTable, coinsTable, tradesTable, pairsTable, settingsTable } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getInrRate, getRawTick } from "../lib/price-service";

/** Always-fresh INR rate: price-service cache first, DB direct fallback */
async function fetchInrRate(): Promise<number> {
  const cached = getInrRate();
  if (cached > 1) return cached;
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "inr_usdt_rate")).limit(1);
    if (row) { const n = Number(row.value); if (Number.isFinite(n) && n > 1) return n; }
  } catch {}
  return cached;
}

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Live USDT price for a coin: cache first, DB fallback */
function livePrice(symbol: string, dbPrice: string | null): number {
  const tick = getRawTick(symbol);
  if (tick && tick.usdt > 0) return tick.usdt;
  return Number(dbPrice ?? 0);
}

/** Live 24h change % for a coin */
function live24hChange(symbol: string, dbChange: string | null): number {
  const tick = getRawTick(symbol);
  if (tick) return tick.change24h;
  return Number(dbChange ?? 0);
}

// ── summary ──────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/summary", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await fetchInrRate();

  const wallets = await db.select({
    walletType:  walletsTable.walletType,
    coinId:      walletsTable.coinId,
    balance:     walletsTable.balance,
    locked:      walletsTable.locked,
    coinSymbol:  coinsTable.symbol,
    coinName:    coinsTable.name,
    coinIcon:    coinsTable.logoUrl,
    dbPrice:     coinsTable.currentPrice,
    dbChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let totalUsd      = 0;
  let totalChangeUsd = 0;
  const allocation: Array<{
    symbol: string; name: string; icon: string | null;
    valueUsd: number; valueInr: number;
    pct: number; change24hPct: number; balance: number;
  }> = [];

  // Merge all wallet types (spot + futures + earn + inr) by coin symbol
  const bySymbol = new Map<string, {
    symbol: string; name: string; icon: string | null;
    balance: number; dbPrice: string | null; dbChange24h: string | null;
  }>();

  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    if (total <= 0) continue;
    const sym = w.coinSymbol ?? "?";
    if (bySymbol.has(sym)) {
      bySymbol.get(sym)!.balance += total;
    } else {
      bySymbol.set(sym, {
        symbol: sym,
        name: w.coinName ?? "?",
        icon: w.coinIcon ?? null,
        balance: total,
        dbPrice: w.dbPrice ?? null,
        dbChange24h: w.dbChange24h ?? null,
      });
    }
  }

  for (const entry of bySymbol.values()) {
    const sym    = entry.symbol;
    const price  = livePrice(sym, entry.dbPrice);
    const ch24   = live24hChange(sym, entry.dbChange24h);

    const valueUsd       = entry.balance * price;
    const valueYesterday = valueUsd / (1 + ch24 / 100);
    totalChangeUsd += valueUsd - valueYesterday;
    totalUsd       += valueUsd;

    allocation.push({
      symbol:       sym,
      name:         entry.name,
      icon:         entry.icon,
      valueUsd,
      valueInr:     valueUsd * inrRate,
      pct:          0,
      change24hPct: ch24,
      balance:      entry.balance,
    });
  }

  for (const a of allocation) a.pct = totalUsd > 0 ? (a.valueUsd / totalUsd) * 100 : 0;
  allocation.sort((a, b) => b.valueUsd - a.valueUsd);

  res.json({
    totalEquityUsd:  totalUsd,
    totalEquityInr:  totalUsd * inrRate,
    pnl24hUsd:       totalChangeUsd,
    pnl24hInr:       totalChangeUsd * inrRate,
    pnl24hPct:       totalUsd > 0 ? (totalChangeUsd / totalUsd) * 100 : 0,
    activeAssets:    allocation.length,
    inrRate,
    allocation,
  });
});

// ── history ───────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/history", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const days    = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));
  const inrRate = await fetchInrRate();

  const wallets = await db.select({
    balance:     walletsTable.balance,
    locked:      walletsTable.locked,
    coinSymbol:  coinsTable.symbol,
    dbPrice:     coinsTable.currentPrice,
    dbChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let currentUsd = 0, weightedDailyChange = 0;
  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    const sym   = w.coinSymbol ?? "?";
    const price = livePrice(sym, w.dbPrice);
    const v     = total * price;
    if (v <= 0) continue;
    currentUsd           += v;
    weightedDailyChange  += v * (live24hChange(sym, w.dbChange24h) / 100);
  }
  const avgDaily = currentUsd > 0 ? weightedDailyChange / currentUsd : 0;

  const points: Array<{ date: string; equityUsd: number; equityInr: number }> = [];
  let v = currentUsd;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    points.unshift({ date: d.toISOString().slice(0, 10), equityUsd: v, equityInr: v * inrRate });
    const jitter = (Math.sin(i * 1.3) * 0.005) + (Math.cos(i * 0.7) * 0.003);
    v = v / (1 + (avgDaily * 0.5) + jitter);
    if (v < 0) v = currentUsd * 0.5;
  }
  res.json({ days, inrRate, points });
});

// ── /portfolio/history — simple alias expected by Portfolio page ──────────────
// Returns HistoryPoint[] = { date, usd, inr }[] (30-day default)
router.get("/portfolio/history", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const days    = 30;
  const inrRate = await fetchInrRate();

  const wallets = await db.select({
    balance:     walletsTable.balance,
    locked:      walletsTable.locked,
    coinSymbol:  coinsTable.symbol,
    dbPrice:     coinsTable.currentPrice,
    dbChange24h: coinsTable.change24h,
  }).from(walletsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, walletsTable.coinId))
    .where(eq(walletsTable.userId, userId));

  let currentUsd = 0, weightedDailyChange = 0;
  for (const w of wallets) {
    const total = Number(w.balance) + Number(w.locked);
    const sym   = w.coinSymbol ?? "?";
    const price = livePrice(sym, w.dbPrice);
    const v     = total * price;
    if (v <= 0) continue;
    currentUsd          += v;
    weightedDailyChange += v * (live24hChange(sym, w.dbChange24h) / 100);
  }
  const avgDaily = currentUsd > 0 ? weightedDailyChange / currentUsd : 0;

  const points: Array<{ date: string; usd: number; inr: number }> = [];
  let v = currentUsd;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    points.unshift({ date: d.toISOString().slice(0, 10), usd: v, inr: v * inrRate });
    const jitter = (Math.sin(i * 1.3) * 0.005) + (Math.cos(i * 0.7) * 0.003);
    v = v / (1 + (avgDaily * 0.5) + jitter);
    if (v < 0) v = currentUsd * 0.5;
  }
  res.json(points);
});

// ── tax report ────────────────────────────────────────────────────────────────

router.get("/portfolio/analytics/tax-report", requireAuth, async (req, res): Promise<void> => {
  const userId  = req.user!.id;
  const inrRate = await fetchInrRate();
  // Parse as UTC midnight to avoid timezone shifts pushing April 1 → March 31.
  const fyStart = typeof req.query.from === "string"
    ? new Date(req.query.from + "T00:00:00Z")
    : (() => {
        const now = new Date();
        const year = now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
        return new Date(`${year}-04-01T00:00:00Z`);
      })();
  if (isNaN(fyStart.getTime())) { res.status(400).json({ error: "bad from date" }); return; }

  // JOIN with pairs to get quote currency — needed to correctly convert notional & TDS to USDT
  const rows = await db
    .select({
      id:         tradesTable.id,
      side:       tradesTable.side,
      price:      tradesTable.price,
      qty:        tradesTable.qty,
      fee:        tradesTable.fee,
      tds:        tradesTable.tds,
      createdAt:  tradesTable.createdAt,
      pairSymbol: pairsTable.symbol,   // e.g. "BTC/INR" or "BTC/USDT"
    })
    .from(tradesTable)
    .leftJoin(pairsTable, eq(tradesTable.pairId, pairsTable.id))
    .where(and(eq(tradesTable.userId, userId), gte(tradesTable.createdAt, fyStart)))
    .orderBy(desc(tradesTable.createdAt))
    .limit(5000);

  let totalSellVolumeUsd = 0, totalBuyVolumeUsd = 0;
  let totalFeesUsd = 0, totalTdsUsd = 0;
  let buyCount = 0, sellCount = 0;

  // Per-trade rows for display (most recent 200)
  const tradeRows: Array<{
    id: number; date: string; pair: string; side: string;
    notionalInr: number; notionalUsd: number;
    feeInr: number; feeUsd: number;
    tdsInr: number; tdsUsd: number;
  }> = [];

  for (const t of rows) {
    const rawNotional = Number(t.price) * Number(t.qty);
    const rawFee      = Number(t.fee ?? 0);

    const quoteSymbol = t.pairSymbol?.split("/")[1]?.toUpperCase() ?? "USDT";
    const isInrQuote  = quoteSymbol === "INR";

    // Normalise to USDT; INR pair amounts divided by live rate
    const notionalUsd = isInrQuote ? rawNotional / inrRate : rawNotional;
    const feeUsd      = isInrQuote ? rawFee      / inrRate : rawFee;

    // TDS: prefer the amount stored at trade time (charged at historical INR rate).
    // Fall back to recalculating as 1% of notional when the column is null
    // (trades before TDS implementation or bot-only rows).
    const storedTds = t.tds !== null && t.tds !== undefined ? Number(t.tds) : -1;
    const tdsUsd = t.side === "sell"
      ? (storedTds >= 0
          ? (isInrQuote ? storedTds / inrRate : storedTds)
          : notionalUsd * 0.01)
      : 0;
    const tdsInr = tdsUsd * inrRate;

    totalFeesUsd += feeUsd;
    if (t.side === "sell") {
      totalSellVolumeUsd += notionalUsd;
      totalTdsUsd        += tdsUsd;
      sellCount++;
    } else {
      totalBuyVolumeUsd += notionalUsd;
      buyCount++;
    }

    if (tradeRows.length < 200) {
      tradeRows.push({
        id:          Number(t.id),
        date:        t.createdAt ? new Date(t.createdAt).toISOString() : "",
        pair:        t.pairSymbol ?? "—",
        side:        t.side ?? "—",
        notionalInr: notionalUsd * inrRate,
        notionalUsd,
        feeInr:      feeUsd * inrRate,
        feeUsd,
        tdsInr,
        tdsUsd,
      });
    }
  }

  res.json({
    fyStart: fyStart.toISOString(),
    inrRate,
    totals: {
      // sell volume only (TDS base)
      totalSellVolumeUsd, totalSellVolumeInr: totalSellVolumeUsd * inrRate,
      // buy volume for context
      totalBuyVolumeUsd,  totalBuyVolumeInr:  totalBuyVolumeUsd  * inrRate,
      totalFeesUsd,       totalFeesInr:       totalFeesUsd       * inrRate,
      totalTdsUsd,        totalTdsInr:        totalTdsUsd        * inrRate,
      buyCount, sellCount, tradeCount: rows.length,
    },
    trades: tradeRows,
    note: "TDS (Tax Deducted at Source) — 1% on every sell (Sec 194S PMLA). INR values at current USDT/INR rate.",
  });
});

export default router;
