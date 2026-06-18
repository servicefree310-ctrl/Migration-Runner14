/**
 * Trading Bots API — user routes
 *
 *   GET    /bots                 — list caller's bots (with stats)
 *   POST   /bots                 — create a new bot (grid or dca)
 *   GET    /bots/:id             — bot detail + recent trades
 *   POST   /bots/:id/start       — start a stopped bot (balance-checked)
 *   POST   /bots/:id/stop        — stop a running bot
 *   DELETE /bots/:id             — delete a stopped bot
 */
import { Router, type IRouter } from "express";
import { db, tradingBotsTable, botTradesTable, walletsTable, coinsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getRawTick } from "../lib/price-service";

const router: IRouter = Router();

router.get("/bots", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(tradingBotsTable)
    .where(eq(tradingBotsTable.userId, req.user!.id))
    .orderBy(desc(tradingBotsTable.createdAt));
  res.json({ items: rows });
});

router.get("/bots/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [bot] = await db.select().from(tradingBotsTable)
    .where(and(eq(tradingBotsTable.id, id), eq(tradingBotsTable.userId, req.user!.id)));
  if (!bot) { res.status(404).json({ error: "not found" }); return; }
  const trades = await db.select().from(botTradesTable)
    .where(eq(botTradesTable.botId, id))
    .orderBy(desc(botTradesTable.createdAt))
    .limit(100);
  res.json({ bot, trades });
});

router.post("/bots", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if ((req.user!.kycLevel ?? 0) < 1) {
    res.status(403).json({ error: "KYC Level 1 required to create trading bots" }); return;
  }
  const { name, botType, symbol, baseSymbol, quoteSymbol, config } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name required" }); return; }
  if (botType !== "grid" && botType !== "dca") { res.status(400).json({ error: "botType must be grid|dca" }); return; }
  if (typeof symbol !== "string" || !symbol.trim()) { res.status(400).json({ error: "symbol required" }); return; }
  if (typeof baseSymbol !== "string" || !baseSymbol.trim()) { res.status(400).json({ error: "baseSymbol required" }); return; }
  if (typeof quoteSymbol !== "string" || !quoteSymbol.trim()) { res.status(400).json({ error: "quoteSymbol required" }); return; }
  if (!config || typeof config !== "object") { res.status(400).json({ error: "config required" }); return; }

  // Per-user cap
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(tradingBotsTable).where(eq(tradingBotsTable.userId, userId));
  if (n >= 20) { res.status(429).json({ error: "max 20 bots per user" }); return; }

  // Validate config per type
  if (botType === "grid") {
    const c = config as Record<string, unknown>;
    const lp = Number(c.lowerPrice), up = Number(c.upperPrice), gl = Number(c.gridLevels), ta = Number(c.totalAmountUsd);
    if (!Number.isFinite(lp) || lp <= 0) { res.status(400).json({ error: "lowerPrice > 0 required" }); return; }
    if (!Number.isFinite(up) || up <= lp) { res.status(400).json({ error: "upperPrice > lowerPrice required" }); return; }
    if (!Number.isFinite(gl) || gl < 2 || gl > 100) { res.status(400).json({ error: "gridLevels 2-100" }); return; }
    if (!Number.isFinite(ta) || ta < 10 || ta > 1_000_000) { res.status(400).json({ error: "totalAmountUsd 10-1M" }); return; }
  } else {
    const c = config as Record<string, unknown>;
    const am = Number(c.amountUsd), iv = Number(c.intervalMin), cap = Number(c.totalCapUsd);
    if (!Number.isFinite(am) || am < 1) { res.status(400).json({ error: "amountUsd >= 1 required" }); return; }
    if (!Number.isFinite(iv) || iv < 5 || iv > 10080) { res.status(400).json({ error: "intervalMin 5-10080" }); return; }
    if (!Number.isFinite(cap) || cap < am) { res.status(400).json({ error: "totalCapUsd >= amountUsd required" }); return; }
  }

  const [row] = await db.insert(tradingBotsTable).values({
    userId,
    name: name.slice(0, 100),
    botType,
    symbol: symbol.toUpperCase().slice(0, 30),
    baseSymbol: baseSymbol.toUpperCase().slice(0, 20),
    quoteSymbol: quoteSymbol.toUpperCase().slice(0, 20),
    status: "stopped",
    config: config as Record<string, unknown>,
  }).returning();
  res.json({ bot: row });
});

/**
 * Compute the total amount required in the bot's quote currency.
 * totalAmountUsd is always in USD — convert to quote currency at current rate.
 */
function requiredQuoteAmount(bot: typeof tradingBotsTable.$inferSelect): number {
  const cfg = bot.config as Record<string, unknown>;
  const totalUsd = bot.botType === "grid"
    ? Number(cfg.totalAmountUsd ?? 0)
    : Number(cfg.totalCapUsd ?? 0);
  if (totalUsd <= 0) return 0;

  const quote = (bot.quoteSymbol ?? "USDT").toUpperCase();
  if (quote === "USDT") return totalUsd;

  // For INR quote: convert USD → INR using live rate (fallback 84)
  const usdtTick = getRawTick("USDT");
  const inrRate  = usdtTick?.inr && usdtTick.inr > 0 ? usdtTick.inr : 84;
  if (quote === "INR") return totalUsd * inrRate;

  // For other quote coins: totalUsd / quoteUsdPrice
  const qTick = getRawTick(quote);
  if (qTick && qTick.usdt > 0) return totalUsd / qTick.usdt;

  return totalUsd; // fallback: treat as USDT-equivalent
}

router.post("/bots/:id/start", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }

  // Fetch first so we can be idempotent: if already running, return as-is without
  // overwriting startedAt (prevents double-click from erasing the original start time).
  const [current] = await db.select().from(tradingBotsTable)
    .where(and(eq(tradingBotsTable.id, id), eq(tradingBotsTable.userId, req.user!.id)));
  if (!current) { res.status(404).json({ error: "not found" }); return; }
  if (current.status === "running") { res.json({ bot: current }); return; }

  // ── Balance pre-flight check ────────────────────────────────────────────────
  // Verify the user has at least the required quote amount available before
  // starting the bot, so the first tick doesn't silently skip every trade.
  const quoteSymbol = (current.quoteSymbol ?? "USDT").toUpperCase();
  const walletType  = quoteSymbol === "INR" ? "inr" : "spot";
  const required    = requiredQuoteAmount(current);

  if (required > 0) {
    const [quoteCoin] = await db.select({ id: coinsTable.id })
      .from(coinsTable).where(eq(coinsTable.symbol, quoteSymbol)).limit(1);

    if (quoteCoin) {
      const [wallet] = await db.select().from(walletsTable)
        .where(and(
          eq(walletsTable.userId, req.user!.id),
          eq(walletsTable.coinId, quoteCoin.id),
          eq(walletsTable.walletType, walletType),
        )).limit(1);

      const available = wallet
        ? Number(wallet.balance) - Number(wallet.locked ?? 0)
        : 0;

      if (available < required) {
        res.status(402).json({
          error: `Insufficient ${quoteSymbol} balance. Need ${required.toFixed(2)} ${quoteSymbol}, have ${available.toFixed(2)} ${quoteSymbol} available.`,
        });
        return;
      }
    }
  }
  // ── End balance check ───────────────────────────────────────────────────────

  const [row] = await db.update(tradingBotsTable).set({
    status: "running",
    startedAt: new Date(),
    stoppedAt: null,
    lastError: null,
  }).where(and(eq(tradingBotsTable.id, id), eq(tradingBotsTable.userId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ bot: row });
});

router.post("/bots/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [row] = await db.update(tradingBotsTable).set({
    status: "stopped",
    stoppedAt: new Date(),
  }).where(and(eq(tradingBotsTable.id, id), eq(tradingBotsTable.userId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ bot: row });
});

router.delete("/bots/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const [bot] = await db.select().from(tradingBotsTable)
    .where(and(eq(tradingBotsTable.id, id), eq(tradingBotsTable.userId, req.user!.id)));
  if (!bot) { res.status(404).json({ error: "not found" }); return; }
  if (bot.status === "running") { res.status(400).json({ error: "stop bot first" }); return; }
  await db.delete(botTradesTable).where(eq(botTradesTable.botId, id));
  await db.delete(tradingBotsTable).where(eq(tradingBotsTable.id, id));
  res.json({ ok: true });
});

export default router;
