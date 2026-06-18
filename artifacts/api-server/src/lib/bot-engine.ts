/**
 * Trading Bot Engine — leader-gated, runs every 30s.
 *
 * Supports two strategies (enough to demo all the UX without writing a full
 * matching-engine integration in v1):
 *
 *   - GRID: User picks lowerPrice, upperPrice, gridLevels, totalAmountUsd.
 *           Bot buys 1 grid step below current and sells 1 grid step above,
 *           then repeats. PnL = number of round-trips × step%.
 *
 *   - DCA:  User picks amountUsd + intervalMin (+ optional priceFloor /
 *           priceCeil bounds). Bot buys `amountUsd` worth at the live spot
 *           price every interval until totalCap reached.
 *
 * Each simulated trade is recorded in `bot_trades` AND reflected in the user's
 * real spot wallet (quote debit + base credit on BUY; base debit + quote
 * credit on SELL) so balances and ledger history are always accurate.
 *
 * PnL, notional, and qty are ALWAYS stored in USD / base-coin units so the
 * frontend can display them consistently regardless of the quote currency.
 */
import { db, tradingBotsTable, botTradesTable, walletsTable, coinsTable, walletLedgerTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { isLeader } from "./leader";
import { logger } from "./logger";
import { getRawTick } from "./price-service";
import { notify } from "./notifications";

const TICK_MS = 30_000;
let tickTimer: NodeJS.Timeout | null = null;

type GridConfig = {
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  totalAmountUsd: number;
  lastBuyPrice?: number;   // stored in quote currency for trigger comparison
  lastSellPrice?: number;  // stored in quote currency for trigger comparison
};

type DcaConfig = {
  amountUsd: number;
  intervalMin: number;
  totalCapUsd: number;
  priceFloor?: number;   // in quote currency
  priceCeil?: number;    // in quote currency
  spentUsd?: number;
  lastBuyAt?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Price helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the live price of `baseSymbol` in `quoteSymbol`.
 *   getLivePriceQuote("BTC", "INR")  → ₹7,500,000
 *   getLivePriceQuote("BTC", "USDT") → $95,000
 * Uses getRawTick() (non-jittered) so UI price jitter never contaminates fills.
 */
function getLivePriceQuote(baseSymbol: string, quoteSymbol: string): number {
  const base = baseSymbol.replace(/[\/\-]?(?:USDT|INR|BTC|ETH|BNB)$/i, "").toUpperCase() || baseSymbol.toUpperCase();
  const bTick = getRawTick(base);
  if (!bTick || bTick.usdt <= 0) return 0;
  const q = quoteSymbol.toUpperCase();
  if (q === "INR")  return bTick.inr;
  if (q === "USDT") return bTick.usdt;
  const qTick = getRawTick(q);
  if (!qTick || qTick.usdt <= 0) return 0;
  return bTick.usdt / qTick.usdt;
}

/** Always returns price in USDT — used for qty/notional/PnL so they are always in USD */
function getLivePriceUsd(baseSymbol: string): number {
  return getLivePriceQuote(baseSymbol, "USDT");
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Coin ID cache — avoids repeated DB lookups for the same symbol */
const coinIdCache = new Map<string, number>();

async function getCoinId(symbol: string): Promise<number | null> {
  const s = symbol.toUpperCase();
  if (coinIdCache.has(s)) return coinIdCache.get(s)!;
  const [coin] = await db.select({ id: coinsTable.id })
    .from(coinsTable).where(eq(coinsTable.symbol, s)).limit(1);
  if (!coin) return null;
  coinIdCache.set(s, coin.id);
  return coin.id;
}

/** Returns "inr" for the INR fiat coin, "spot" for all others */
function spotOrInr(symbol: string): string {
  return symbol.toUpperCase() === "INR" ? "inr" : "spot";
}

/**
 * Atomically applies wallet debit/credit for one bot trade.
 *
 * BUY  → debit `notionalQuote` from quote wallet, credit `qty` to base wallet.
 * SELL → debit `qty` from base wallet, credit `notionalQuote` to quote wallet.
 *
 * Returns false (and logs a warning) when the user has insufficient balance.
 * Throws on unexpected DB errors so the caller can mark bot.lastError.
 */
async function applyBotWalletOps(
  userId: number,
  baseSymbol: string,
  quoteSymbol: string,
  side: "buy" | "sell",
  qty: number,
  priceQuote: number,
  note: string,
): Promise<boolean> {
  const baseCoinId  = await getCoinId(baseSymbol);
  const quoteCoinId = await getCoinId(quoteSymbol);
  if (!baseCoinId || !quoteCoinId) {
    logger.warn({ userId, baseSymbol, quoteSymbol }, "bot.wallet: coin not found, skipping");
    return false;
  }

  const baseWt      = spotOrInr(baseSymbol);
  const quoteWt     = spotOrInr(quoteSymbol);
  const notionalQuote = qty * priceQuote;

  try {
    await db.transaction(async (tx) => {
      if (side === "buy") {
        // ── Debit quote wallet ──────────────────────────────────────────────
        const [qw] = await tx.select().from(walletsTable)
          .where(and(
            eq(walletsTable.userId, userId),
            eq(walletsTable.coinId, quoteCoinId),
            eq(walletsTable.walletType, quoteWt),
          ))
          .for("update").limit(1);

        const quoteAvail = qw ? (Number(qw.balance) - Number(qw.locked ?? 0)) : 0;
        if (quoteAvail < notionalQuote) {
          throw Object.assign(new Error("insufficient_balance"), { isInsuf: true });
        }

        await tx.update(walletsTable)
          .set({
            balance: sql`${walletsTable.balance} - ${String(notionalQuote)}`,
            updatedAt: new Date(),
          })
          .where(eq(walletsTable.id, qw!.id));

        const qBalBefore = Number(qw!.balance);
        const qBalAfter  = qBalBefore - notionalQuote;

        // ── Credit base wallet ──────────────────────────────────────────────
        const [bwExist] = await tx.select().from(walletsTable)
          .where(and(
            eq(walletsTable.userId, userId),
            eq(walletsTable.coinId, baseCoinId),
            eq(walletsTable.walletType, baseWt),
          ))
          .for("update").limit(1);

        let bBalBefore = 0;
        if (bwExist) {
          bBalBefore = Number(bwExist.balance);
          await tx.update(walletsTable)
            .set({
              balance: sql`${walletsTable.balance} + ${String(qty)}`,
              updatedAt: new Date(),
            })
            .where(eq(walletsTable.id, bwExist.id));
        } else {
          await tx.insert(walletsTable).values({
            userId, coinId: baseCoinId, walletType: baseWt,
            balance: String(qty), locked: "0",
          });
        }

        // ── Ledger entries ─────────────────────────────────────────────────
        await tx.insert(walletLedgerTable).values([
          {
            userId, coinId: quoteCoinId, walletType: quoteWt,
            type: "trade_buy" as const,
            amount: String(-notionalQuote),
            balanceBefore: String(qBalBefore),
            balanceAfter:  String(qBalAfter),
            refType: "bot_trade", refId: String(userId),
            note,
          },
          {
            userId, coinId: baseCoinId, walletType: baseWt,
            type: "trade_buy" as const,
            amount: String(qty),
            balanceBefore: String(bBalBefore),
            balanceAfter:  String(bBalBefore + qty),
            refType: "bot_trade", refId: String(userId),
            note,
          },
        ]);
      } else {
        // ── Debit base wallet ───────────────────────────────────────────────
        const [bw] = await tx.select().from(walletsTable)
          .where(and(
            eq(walletsTable.userId, userId),
            eq(walletsTable.coinId, baseCoinId),
            eq(walletsTable.walletType, baseWt),
          ))
          .for("update").limit(1);

        const baseAvail = bw ? (Number(bw.balance) - Number(bw.locked ?? 0)) : 0;
        if (baseAvail < qty) {
          throw Object.assign(new Error("insufficient_balance"), { isInsuf: true });
        }

        await tx.update(walletsTable)
          .set({
            balance: sql`${walletsTable.balance} - ${String(qty)}`,
            updatedAt: new Date(),
          })
          .where(eq(walletsTable.id, bw!.id));

        const bBalBefore = Number(bw!.balance);
        const bBalAfter  = bBalBefore - qty;

        // ── Credit quote wallet ─────────────────────────────────────────────
        const [qwExist] = await tx.select().from(walletsTable)
          .where(and(
            eq(walletsTable.userId, userId),
            eq(walletsTable.coinId, quoteCoinId),
            eq(walletsTable.walletType, quoteWt),
          ))
          .for("update").limit(1);

        let qBalBefore = 0;
        if (qwExist) {
          qBalBefore = Number(qwExist.balance);
          await tx.update(walletsTable)
            .set({
              balance: sql`${walletsTable.balance} + ${String(notionalQuote)}`,
              updatedAt: new Date(),
            })
            .where(eq(walletsTable.id, qwExist.id));
        } else {
          await tx.insert(walletsTable).values({
            userId, coinId: quoteCoinId, walletType: quoteWt,
            balance: String(notionalQuote), locked: "0",
          });
        }

        // ── Ledger entries ─────────────────────────────────────────────────
        await tx.insert(walletLedgerTable).values([
          {
            userId, coinId: baseCoinId, walletType: baseWt,
            type: "trade_sell" as const,
            amount: String(-qty),
            balanceBefore: String(bBalBefore),
            balanceAfter:  String(bBalAfter),
            refType: "bot_trade", refId: String(userId),
            note,
          },
          {
            userId, coinId: quoteCoinId, walletType: quoteWt,
            type: "trade_sell" as const,
            amount: String(notionalQuote),
            balanceBefore: String(qBalBefore),
            balanceAfter:  String(qBalBefore + notionalQuote),
            refType: "bot_trade", refId: String(userId),
            note,
          },
        ]);
      }
    });
    return true;
  } catch (err: any) {
    if (err?.isInsuf) {
      logger.warn(
        { userId, baseSymbol, quoteSymbol, side, qty, notionalQuote },
        "bot.wallet: insufficient balance, skipping trade",
      );
      return false;
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid strategy
// ─────────────────────────────────────────────────────────────────────────────

async function runGridTick(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  const cfg = bot.config as unknown as GridConfig;
  if (!cfg || !cfg.lowerPrice || !cfg.upperPrice || !cfg.gridLevels) return;

  const quoteSymbol = (bot.quoteSymbol ?? "USDT").toUpperCase();
  const base        = bot.baseSymbol ?? bot.symbol;

  // Use quote-currency price for range trigger (user configured bounds in quote currency)
  const priceQuote = getLivePriceQuote(base, quoteSymbol);
  if (!priceQuote) return;
  if (priceQuote < cfg.lowerPrice || priceQuote > cfg.upperPrice) return;

  // Use USD price for all qty/notional/PnL so stored values are always in USD
  const priceUsd = quoteSymbol === "USDT" ? priceQuote : getLivePriceUsd(base);
  if (!priceUsd) return;

  const range      = cfg.upperPrice - cfg.lowerPrice;
  const step       = range / Math.max(1, cfg.gridLevels - 1);
  const perGridUsd = cfg.totalAmountUsd / cfg.gridLevels;
  const lastBuy    = cfg.lastBuyPrice ?? 0;   // quote currency
  const lastSell   = cfg.lastSellPrice ?? 0;  // quote currency

  // BUY trigger: price dropped >= step below lastBuy (or we've never bought)
  if (!lastBuy || priceQuote <= lastBuy - step) {
    const qty = perGridUsd / priceUsd;  // USD / (USD/base) = base units ✓

    // Debit quote wallet, credit base wallet — skip if insufficient balance
    const ok = await applyBotWalletOps(
      bot.userId, base, quoteSymbol, "buy", qty, priceQuote,
      `Bot "${bot.name}" grid buy ${base}/${quoteSymbol} @ ${priceQuote}`,
    );
    if (!ok) return;

    await db.insert(botTradesTable).values({
      botId: bot.id, userId: bot.userId, side: "buy",
      price: String(priceUsd), qty: String(qty), notional: String(perGridUsd),
      reason: "grid:buy_step",
    });
    await db.update(tradingBotsTable).set({
      totalTrades: sql`${tradingBotsTable.totalTrades} + 1`,
      lastRunAt: new Date(),
      config: { ...cfg, lastBuyPrice: priceQuote } as unknown as Record<string, unknown>,
    }).where(eq(tradingBotsTable.id, bot.id));
    return;
  }

  // SELL trigger: price rose >= step above lastSell (and we have a recent buy)
  if (lastBuy && (!lastSell || priceQuote >= lastSell + step) && priceQuote >= lastBuy + step) {
    // Reconstruct USD price at last buy via current cross-rate (approximation for simulation)
    const lastBuyUsd = quoteSymbol === "USDT"
      ? lastBuy
      : (lastBuy / (priceQuote > 0 ? priceQuote : 1)) * priceUsd;
    const qty    = perGridUsd / (lastBuyUsd > 0 ? lastBuyUsd : priceUsd);  // base units ✓
    const pnlUsd = (priceUsd - lastBuyUsd) * qty;                          // USD PnL ✓

    // Debit base wallet, credit quote wallet — skip if insufficient balance
    const ok = await applyBotWalletOps(
      bot.userId, base, quoteSymbol, "sell", qty, priceQuote,
      `Bot "${bot.name}" grid sell ${base}/${quoteSymbol} @ ${priceQuote}`,
    );
    if (!ok) return;

    await db.insert(botTradesTable).values({
      botId: bot.id, userId: bot.userId, side: "sell",
      price: String(priceUsd), qty: String(qty), notional: String(qty * priceUsd),
      pnlUsd: String(pnlUsd), reason: "grid:sell_step",
    });
    await db.update(tradingBotsTable).set({
      totalTrades:      sql`${tradingBotsTable.totalTrades} + 1`,
      successfulTrades: sql`${tradingBotsTable.successfulTrades} + ${pnlUsd > 0 ? 1 : 0}`,
      realizedPnlUsd:   sql`${tradingBotsTable.realizedPnlUsd} + ${String(pnlUsd)}`,
      lastRunAt: new Date(),
      config: { ...cfg, lastSellPrice: priceQuote } as unknown as Record<string, unknown>,
    }).where(eq(tradingBotsTable.id, bot.id));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DCA strategy
// ─────────────────────────────────────────────────────────────────────────────

async function runDcaTick(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  const cfg = bot.config as unknown as DcaConfig;
  if (!cfg || !cfg.amountUsd || !cfg.intervalMin) return;

  const quoteSymbol = (bot.quoteSymbol ?? "USDT").toUpperCase();
  const base        = bot.baseSymbol ?? bot.symbol;

  // Use quote-currency price for floor/ceil trigger (user configured bounds in quote currency)
  const priceQuote = getLivePriceQuote(base, quoteSymbol);
  if (!priceQuote) return;
  if (cfg.priceFloor && priceQuote < cfg.priceFloor) return;
  if (cfg.priceCeil  && priceQuote > cfg.priceCeil)  return;

  const lastAt  = cfg.lastBuyAt ? new Date(cfg.lastBuyAt).getTime() : 0;
  const sinceMs = Date.now() - lastAt;
  if (sinceMs < cfg.intervalMin * 60_000) return;

  const spent = cfg.spentUsd ?? 0;
  if (cfg.totalCapUsd && spent >= cfg.totalCapUsd) {
    await db.update(tradingBotsTable).set({
      status: "completed",
      stoppedAt: new Date(),
    }).where(eq(tradingBotsTable.id, bot.id));
    await notify({
      userId: bot.userId, kind: "success", category: "trade",
      title: `DCA bot "${bot.name}" completed`,
      body: `Total invested: $${spent.toFixed(2)} into ${bot.baseSymbol}.`,
      ctaLabel: "View bot", ctaUrl: "/bots",
    });
    return;
  }

  const buyAmount = Math.min(cfg.amountUsd, cfg.totalCapUsd ? cfg.totalCapUsd - spent : cfg.amountUsd);

  // Use USD price for qty so it's always in base units regardless of quote currency
  const priceUsd = quoteSymbol === "USDT" ? priceQuote : getLivePriceUsd(base);
  if (!priceUsd) return;

  const qty = buyAmount / priceUsd;  // USD / (USD/base) = base units ✓

  // Debit quote wallet, credit base wallet — skip if insufficient balance
  const ok = await applyBotWalletOps(
    bot.userId, base, quoteSymbol, "buy", qty, priceQuote,
    `Bot "${bot.name}" DCA buy ${base}/${quoteSymbol} @ ${priceQuote}`,
  );
  if (!ok) return;

  await db.insert(botTradesTable).values({
    botId: bot.id, userId: bot.userId, side: "buy",
    price: String(priceUsd), qty: String(qty), notional: String(buyAmount),
    reason: "dca:scheduled",
  });
  await db.update(tradingBotsTable).set({
    totalTrades:      sql`${tradingBotsTable.totalTrades} + 1`,
    totalInvestedUsd: sql`${tradingBotsTable.totalInvestedUsd} + ${String(buyAmount)}`,
    lastRunAt: new Date(),
    config: { ...cfg, spentUsd: spent + buyAmount, lastBuyAt: new Date().toISOString() } as unknown as Record<string, unknown>,
  }).where(eq(tradingBotsTable.id, bot.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Unrealised PnL recompute
// ─────────────────────────────────────────────────────────────────────────────

async function recomputeUnrealizedPnl(bot: typeof tradingBotsTable.$inferSelect): Promise<void> {
  // All stored prices/notionals are in USD (fixed in runGridTick / runDcaTick)
  const trades = await db.select().from(botTradesTable).where(eq(botTradesTable.botId, bot.id));
  let buyQty = 0, buyNotionalUsd = 0, sellQty = 0;
  for (const t of trades) {
    if (t.side === "buy") { buyQty += Number(t.qty); buyNotionalUsd += Number(t.notional); }
    else { sellQty += Number(t.qty); }
  }
  const pos = buyQty - sellQty;
  if (pos <= 0) {
    await db.update(tradingBotsTable).set({ unrealizedPnlUsd: "0" }).where(eq(tradingBotsTable.id, bot.id));
    return;
  }
  const avgCostUsd = buyQty > 0 ? buyNotionalUsd / buyQty : 0;  // USD/base ✓
  const priceUsd   = getLivePriceUsd(bot.baseSymbol ?? bot.symbol);
  const upnl       = (priceUsd - avgCostUsd) * pos;              // USD ✓
  await db.update(tradingBotsTable).set({ unrealizedPnlUsd: String(upnl) })
    .where(eq(tradingBotsTable.id, bot.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine tick
// ─────────────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (!isLeader()) return;
  try {
    const running = await db.select().from(tradingBotsTable).where(eq(tradingBotsTable.status, "running")).limit(200);
    for (const bot of running) {
      try {
        if (bot.botType === "grid") await runGridTick(bot);
        else if (bot.botType === "dca") await runDcaTick(bot);
        await recomputeUnrealizedPnl(bot);
      } catch (err) {
        logger.warn({ err, botId: bot.id }, "bot.tick_failed");
        await db.update(tradingBotsTable).set({
          lastError: String(err).slice(0, 500),
        }).where(eq(tradingBotsTable.id, bot.id));
      }
    }
  } catch (err) {
    logger.warn({ err }, "bot.engine.tick_failed");
  }
}

export function startBotEngine(intervalMs: number = TICK_MS): void {
  if (tickTimer) return;
  logger.info({ intervalMs }, "bot-engine.starting");
  tickTimer = setInterval(tick, intervalMs);
  setTimeout(tick, 5_000).unref();
  tickTimer.unref();
}

export function stopBotEngine(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
