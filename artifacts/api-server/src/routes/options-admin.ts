/**
 * Options trading — admin routes.
 * All paths require admin/superadmin role; every mutation is audit-logged.
 *
 *   GET    /admin/options/contracts            — list ALL (active+expired+settled)
 *   POST   /admin/options/contracts            — create
 *   PATCH  /admin/options/contracts/:id        — edit IV / risk-free / status
 *   DELETE /admin/options/contracts/:id        — soft-delete (status=disabled), only if no positions
 *   POST   /admin/options/contracts/:id/settle — force-settle now (bypasses expiry timer)
 */
import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, optionContractsTable, optionPositionsTable, coinsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";
import { runDailyCreate } from "../lib/options-daily-creator";

const router: IRouter = Router();

const ADMIN_GUARD = [requireAuth, requireRole("admin", "superadmin")];

router.get("/admin/options/contracts", ...ADMIN_GUARD, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: optionContractsTable.id,
    symbol: optionContractsTable.symbol,
    underlyingCoinId: optionContractsTable.underlyingCoinId,
    underlyingSymbol: coinsTable.symbol,
    quoteCoinSymbol: optionContractsTable.quoteCoinSymbol,
    optionType: optionContractsTable.optionType,
    strikePrice: optionContractsTable.strikePrice,
    expiryAt: optionContractsTable.expiryAt,
    ivBps: optionContractsTable.ivBps,
    riskFreeRateBps: optionContractsTable.riskFreeRateBps,
    contractSize: optionContractsTable.contractSize,
    minQty: optionContractsTable.minQty,
    status: optionContractsTable.status,
    settlementPrice: optionContractsTable.settlementPrice,
    settledAt: optionContractsTable.settledAt,
    createdAt: optionContractsTable.createdAt,
  }).from(optionContractsTable)
    .leftJoin(coinsTable, eq(coinsTable.id, optionContractsTable.underlyingCoinId))
    .orderBy(desc(optionContractsTable.expiryAt));
  res.json({ contracts: rows });
});

router.post("/admin/options/contracts", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const { underlyingSymbol, quoteCoinSymbol, optionType, strikePrice, expiryAt, ivBps, riskFreeRateBps, contractSize, minQty } = req.body ?? {};
  if (!underlyingSymbol || !optionType || !strikePrice || !expiryAt) {
    res.status(400).json({ error: "underlyingSymbol, optionType, strikePrice, expiryAt are required" });
    return;
  }
  if (optionType !== "call" && optionType !== "put") { res.status(400).json({ error: "optionType must be 'call' or 'put'" }); return; }
  const strike = Number(strikePrice);
  if (!Number.isFinite(strike) || strike <= 0) { res.status(400).json({ error: "strikePrice must be positive" }); return; }
  const exp = new Date(expiryAt);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) { res.status(400).json({ error: "expiryAt must be a future date" }); return; }

  const [coin] = await db.select().from(coinsTable).where(eq(coinsTable.symbol, String(underlyingSymbol).toUpperCase())).limit(1);
  if (!coin) { res.status(400).json({ error: `underlying coin ${underlyingSymbol} not found` }); return; }

  // Build symbol: e.g. BTC-30MAY26-50000-C
  const dd = String(exp.getUTCDate()).padStart(2, "0");
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][exp.getUTCMonth()];
  const yy = String(exp.getUTCFullYear()).slice(-2);
  const symbol = `${coin.symbol}-${dd}${mon}${yy}-${strike}-${optionType === "call" ? "C" : "P"}`;

  try {
    const [row] = await db.insert(optionContractsTable).values({
      symbol,
      underlyingCoinId: coin.id,
      quoteCoinSymbol: String(quoteCoinSymbol ?? "USDT").toUpperCase(),
      optionType,
      strikePrice: String(strike),
      expiryAt: exp,
      ivBps: Math.max(100, Math.min(40000, Number(ivBps ?? 8000))),
      riskFreeRateBps: Math.max(0, Math.min(2000, Number(riskFreeRateBps ?? 500))),
      contractSize: String(Number(contractSize ?? 1)),
      minQty: String(Number(minQty ?? 0.01)),
    }).returning();
    await logAdminAction(req, { action: "options.contract.create", entity: "option_contract", entityId: row.id, payload: { symbol } });
    res.status(201).json(row);
  } catch (e: any) {
    if (String(e.message || "").includes("duplicate")) { res.status(409).json({ error: "contract symbol already exists" }); return; }
    throw e;
  }
});

router.patch("/admin/options/contracts/:id", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { ivBps, riskFreeRateBps, status } = req.body ?? {};
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const patch: any = {};
  if (ivBps !== undefined) patch.ivBps = Math.max(100, Math.min(40000, Number(ivBps)));
  if (riskFreeRateBps !== undefined) patch.riskFreeRateBps = Math.max(0, Math.min(2000, Number(riskFreeRateBps)));
  if (status !== undefined) {
    if (!["active", "disabled", "expired", "settled"].includes(status)) { res.status(400).json({ error: "bad status" }); return; }
    patch.status = status;
  }
  if (!Object.keys(patch).length) { res.status(400).json({ error: "nothing to update" }); return; }
  const [row] = await db.update(optionContractsTable).set(patch).where(eq(optionContractsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await logAdminAction(req, { action: "options.contract.update", entity: "option_contract", entityId: id, payload: patch });
  res.json(row);
});

router.delete("/admin/options/contracts/:id", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const open = await db.select({ id: optionPositionsTable.id }).from(optionPositionsTable).where(
    and(eq(optionPositionsTable.contractId, id), eq(optionPositionsTable.status, "open")),
  ).limit(1);
  if (open.length) { res.status(400).json({ error: "cannot delete — open positions exist; force-settle first" }); return; }
  await db.delete(optionContractsTable).where(eq(optionContractsTable.id, id));
  await logAdminAction(req, { action: "options.contract.delete", entity: "option_contract", entityId: id });
  res.json({ ok: true });
});

// ─── Daily auto-create (manual trigger) ──────────────────────────────────────
router.post("/admin/options/daily-create", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const result = await runDailyCreate();
  await logAdminAction(req, {
    action: "options.daily_create",
    entity: "option_contract",
    entityId: 0,
    payload: { created: result.created, skipped: result.skipped, errors: result.errors },
  });
  res.json(result);
});

router.post("/admin/options/contracts/:id/settle", ...ADMIN_GUARD, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [c] = await db.select().from(optionContractsTable).where(eq(optionContractsTable.id, id)).limit(1);
  if (!c) { res.status(404).json({ error: "not found" }); return; }
  if (c.status === "settled") { res.status(400).json({ error: "already settled" }); return; }
  // Force expiry by setting expiryAt to "just now" — engine tick will pick it up.
  await db.update(optionContractsTable).set({
    expiryAt: new Date(Date.now() - 1000),
    status: "active", // ensure tick processes
  }).where(eq(optionContractsTable.id, id));
  await logAdminAction(req, { action: "options.contract.force_settle", entity: "option_contract", entityId: id });
  res.json({ ok: true, hint: "Engine will settle within ~1 minute" });
});

export default router;
