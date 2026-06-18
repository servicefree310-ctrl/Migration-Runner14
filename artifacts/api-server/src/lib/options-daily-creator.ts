/**
 * Daily Options Chain Creator
 *
 * Automatically creates a professional options chain every day for the top-5
 * crypto pairs:  BTC · ETH · BNB · SOL · XRP
 *
 * Structure per symbol, per run:
 *   Expiry series
 *     • Daily  — next trading session expiry at 10:00 UTC (15:30 IST)
 *     • Weekly — next Friday at 10:00 UTC
 *   Strike chain
 *     • ATM rounded to symbol-specific interval
 *     • 5 OTM + ATM + 5 ITM = 11 strikes per type
 *     • CALL + PUT at every strike
 *   → 5 symbols × 2 expiries × 11 strikes × 2 types = up to 220 contracts/day
 *     Duplicates are skipped via ON CONFLICT DO NOTHING.
 *
 * Scheduler fires once at 00:30 UTC each day (leader only).
 * Also exported as runDailyCreate() for the admin manual-trigger endpoint.
 */
import { db, coinsTable, optionContractsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { isLeader } from "./leader";

// ─── Top-5 pair configuration ─────────────────────────────────────────────────
const TOP5_CONFIG: Array<{
  symbol:          string;
  ivBps:           number;   // annualized implied volatility in basis points
  riskFreeRateBps: number;   // annualized risk-free rate in bps (≈ Indian repo rate)
  strikeInterval:  number;   // USD increment between strikes
  contractSize:    string;   // units of underlying per contract
  minQty:          string;   // minimum tradeable quantity (in contracts)
}> = [
  { symbol: "BTC", ivBps: 6000,  riskFreeRateBps: 650, strikeInterval: 500,  contractSize: "0.001", minQty: "0.001" },
  { symbol: "ETH", ivBps: 7500,  riskFreeRateBps: 650, strikeInterval: 50,   contractSize: "0.01",  minQty: "0.01"  },
  { symbol: "BNB", ivBps: 8000,  riskFreeRateBps: 650, strikeInterval: 10,   contractSize: "0.1",   minQty: "0.1"   },
  { symbol: "SOL", ivBps: 10000, riskFreeRateBps: 650, strikeInterval: 2,    contractSize: "1",     minQty: "1"     },
  { symbol: "XRP", ivBps: 9000,  riskFreeRateBps: 650, strikeInterval: 0.05, contractSize: "100",   minQty: "100"   },
];

const STRIKE_LEVELS = 5; // OTM levels on each side → 11 total strikes

// ─── Helpers ──────────────────────────────────────────────────────────────────
function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function roundToInterval(price: number, interval: number): number {
  const dp = decimalPlaces(interval);
  const raw = Math.round(price / interval) * interval;
  return parseFloat(raw.toFixed(dp));
}

function buildSymbol(
  underlying: string,
  expiry: Date,
  strike: number,
  type: "call" | "put",
): string {
  const dd  = String(expiry.getUTCDate()).padStart(2, "0");
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][expiry.getUTCMonth()];
  const yy  = String(expiry.getUTCFullYear()).slice(-2);
  return `${underlying}-${dd}${mon}${yy}-${strike}-${type === "call" ? "C" : "P"}`;
}

/** Today's session expiry at 10:00 UTC.  If that time is ≤ 2 h away, roll to tomorrow. */
function dailyExpiry(): Date {
  const d = new Date();
  d.setUTCHours(10, 0, 0, 0);
  if (d.getTime() <= Date.now() + 2 * 3_600_000) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Next Friday at 10:00 UTC (always at least tomorrow). */
function weeklyExpiry(): Date {
  const d = new Date();
  d.setUTCHours(10, 0, 0, 0);
  // Advance to the nearest Friday that is strictly after today
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysToFri = ((5 - dow + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysToFri);
  return d;
}

// ─── Core create function ─────────────────────────────────────────────────────
export type DailyCreateResult = {
  created:   number;
  skipped:   number;
  errors:    number;
  contracts: string[];          // symbols of newly-inserted contracts
  errorDetails: string[];
};

export async function runDailyCreate(): Promise<DailyCreateResult> {
  const res: DailyCreateResult = {
    created: 0, skipped: 0, errors: 0,
    contracts: [], errorDetails: [],
  };

  // Build expiry list — daily always included; weekly only if different day
  const daily  = dailyExpiry();
  const weekly = weeklyExpiry();
  const expiries: Date[] = [daily];
  if (weekly.toDateString() !== daily.toDateString()) expiries.push(weekly);

  for (const cfg of TOP5_CONFIG) {
    // Look up coin
    const [coin] = await db
      .select({ id: coinsTable.id, symbol: coinsTable.symbol, currentPrice: coinsTable.currentPrice, manualPrice: coinsTable.manualPrice })
      .from(coinsTable)
      .where(eq(coinsTable.symbol, cfg.symbol))
      .limit(1);

    if (!coin) {
      logger.warn({ symbol: cfg.symbol }, "options-daily: coin not found — skipping pair");
      res.errors++;
      res.errorDetails.push(`${cfg.symbol}: coin not in DB`);
      continue;
    }

    const spot = Number(coin.currentPrice) || Number(coin.manualPrice ?? 0);
    if (!Number.isFinite(spot) || spot <= 0) {
      logger.warn({ symbol: cfg.symbol, spot }, "options-daily: no price data — skipping pair");
      res.errors++;
      res.errorDetails.push(`${cfg.symbol}: no live price`);
      continue;
    }

    const atm = roundToInterval(spot, cfg.strikeInterval);

    const dp = decimalPlaces(cfg.strikeInterval);

    for (const expiry of expiries) {
      for (let level = -STRIKE_LEVELS; level <= STRIKE_LEVELS; level++) {
        const strike = parseFloat((atm + level * cfg.strikeInterval).toFixed(dp));
        if (strike <= 0) continue;

        for (const type of ["call", "put"] as const) {
          const symbol = buildSymbol(cfg.symbol, expiry, strike, type);
          try {
            const [row] = await db
              .insert(optionContractsTable)
              .values({
                symbol,
                underlyingCoinId:  coin.id,
                quoteCoinSymbol:   "USDT",
                optionType:        type,
                strikePrice:       String(strike),
                expiryAt:          expiry,
                ivBps:             cfg.ivBps,
                riskFreeRateBps:   cfg.riskFreeRateBps,
                contractSize:      cfg.contractSize,
                minQty:            cfg.minQty,
              })
              .onConflictDoNothing()
              .returning({ id: optionContractsTable.id });

            if (row) {
              res.created++;
              res.contracts.push(symbol);
            } else {
              res.skipped++;
            }
          } catch (e: any) {
            logger.error({ err: e, symbol }, "options-daily: insert failed");
            res.errors++;
            res.errorDetails.push(`${symbol}: ${e?.message ?? "unknown"}`);
          }
        }
      }
    }
  }

  logger.info(
    { created: res.created, skipped: res.skipped, errors: res.errors },
    "options-daily-creator: run complete",
  );
  return res;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
let _timer: NodeJS.Timeout | null = null;
let _lastRunDate = "";

export function startOptionsDailyCreator(): void {
  if (_timer) return;

  // Tick every minute; fire at 00:30 UTC
  _timer = setInterval(async () => {
    if (!isLeader()) return;
    const now = new Date();
    if (now.getUTCHours() !== 0 || now.getUTCMinutes() !== 30) return;
    const today = now.toISOString().slice(0, 10);
    if (_lastRunDate === today) return;
    _lastRunDate = today;
    try {
      await runDailyCreate();
    } catch (e) {
      logger.error({ err: e }, "options-daily-creator: scheduled run error");
    }
  }, 60_000);

  // On boot: if no active contracts exist yet, seed today's chain immediately
  setTimeout(async () => {
    if (!isLeader()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (_lastRunDate === today) return;
    try {
      const [existing] = await db
        .select({ id: optionContractsTable.id })
        .from(optionContractsTable)
        .where(eq(optionContractsTable.status, "active"))
        .limit(1);

      if (!existing) {
        _lastRunDate = today;
        await runDailyCreate();
      }
    } catch (e) {
      logger.error({ err: e }, "options-daily-creator: boot seed error");
    }
  }, 12_000);
}
