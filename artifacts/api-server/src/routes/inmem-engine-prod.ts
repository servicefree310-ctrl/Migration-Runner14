import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getProdEngine, shutdownProdEngine } from "../lib/inmem-engine/prod";

// Admin HTTP surface for the PRODUCTION-grade in-memory engine.
//
// Contrast with /admin/inmem-engine/* (the sandbox surface): these routes
// MOVE REAL MONEY. They lock funds, settle to Postgres, charge fees, and
// emit trade rows visible to users. Treat every endpoint here as
// destructive.
//
// All routes are admin/superadmin gated. The "place on behalf" endpoint
// takes an explicit `userId` so an operator can rebalance / unwind on a
// user's account without their session.

const router: IRouter = Router();
const adminOnly = [requireAuth, requireRole("admin", "superadmin")];

const PlaceBody = z.object({
  userId: z.number().int().positive(),
  symbol: z.string().min(1).max(32),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["limit", "market", "ioc", "fok", "post_only"]),
  // For market orders we accept zero/missing — the symbol-registry skips
  // tick + min-notional checks when the engine is told it's a market.
  price: z.number().finite().nonnegative().optional(),
  quantity: z.number().finite().positive(),
  stp: z.enum(["cancel_newest", "cancel_oldest", "cancel_both", "none"]).optional(),
  clientOrderId: z.string().max(64).optional(),
}).strict();

router.post("/admin/inmem-engine-prod/orders", ...adminOnly, async (req, res): Promise<void> => {
  const parsed = PlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid order", errors: parsed.error.flatten() });
    return;
  }
  const engine = await getProdEngine();
  const out: Parameters<typeof engine.placeOrder>[0] = {
    userId: parsed.data.userId,
    symbol: parsed.data.symbol,
    side: parsed.data.side,
    type: parsed.data.type,
    quantity: parsed.data.quantity,
  };
  if (parsed.data.price !== undefined) out.price = parsed.data.price;
  if (parsed.data.stp !== undefined) out.stp = parsed.data.stp;
  if (parsed.data.clientOrderId !== undefined) out.clientOrderId = parsed.data.clientOrderId;
  const result = await engine.placeOrder(out);
  if (!result.ok) {
    const status = result.code === "validation" ? 400
      : result.code === "rate_limited" ? 429
      : result.code === "too_many_open" ? 429
      : result.code === "halted" ? 423
      : result.code === "insufficient_funds" ? 402
      : 500;
    res.status(status).json(result);
    return;
  }
  res.status(201).json(result);
});

router.delete("/admin/inmem-engine-prod/orders/:dbId", ...adminOnly, async (req, res): Promise<void> => {
  const dbId = Number(req.params.dbId);
  const userId = Number(req.query["userId"] ?? 0);
  if (!Number.isFinite(dbId) || dbId <= 0 || !Number.isFinite(userId) || userId <= 0) {
    res.status(400).json({ message: "Invalid dbId or userId" });
    return;
  }
  const engine = await getProdEngine();
  const result = await engine.cancelOrder(userId, dbId);
  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

const SymbolBody = z.object({ symbol: z.string().min(1).max(32) }).strict();

router.post("/admin/inmem-engine-prod/halt", ...adminOnly, async (req, res): Promise<void> => {
  const parsed = SymbolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Missing symbol" }); return; }
  const engine = await getProdEngine();
  await engine.halt(parsed.data.symbol);
  res.json({ ok: true, halted: parsed.data.symbol });
});

router.post("/admin/inmem-engine-prod/resume", ...adminOnly, async (req, res): Promise<void> => {
  const parsed = SymbolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Missing symbol" }); return; }
  const engine = await getProdEngine();
  await engine.resume(parsed.data.symbol);
  res.json({ ok: true, resumed: parsed.data.symbol });
});

router.post("/admin/inmem-engine-prod/cancel-all", ...adminOnly, async (req, res): Promise<void> => {
  const parsed = SymbolBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Missing symbol" }); return; }
  const engine = await getProdEngine();
  const result = await engine.cancelAllForSymbol(parsed.data.symbol);
  res.json({ ok: true, ...result });
});

router.get("/admin/inmem-engine-prod/orderbook/:symbol", ...adminOnly, async (req, res): Promise<void> => {
  const levels = Number(req.query["levels"] ?? 20);
  const safeLevels = Number.isFinite(levels) && levels > 0 ? Math.min(levels, 200) : 20;
  const engine = await getProdEngine();
  res.json(engine.getOrderbook(String(req.params.symbol), safeLevels));
});

router.get("/admin/inmem-engine-prod/metrics", ...adminOnly, async (_req, res): Promise<void> => {
  const engine = await getProdEngine();
  res.json(engine.metrics());
});

router.post("/admin/inmem-engine-prod/snapshot", ...adminOnly, async (_req, res): Promise<void> => {
  const engine = await getProdEngine();
  await engine.snapshotNow();
  res.json({ ok: true, ...engine.metrics() });
});

router.post("/admin/inmem-engine-prod/shutdown", ...adminOnly, async (_req, res): Promise<void> => {
  // Drains the settler queue, snapshots, then closes the WAL. After this
  // the next placeOrder call will boot a fresh ProdEngine instance.
  await shutdownProdEngine();
  res.json({ ok: true, shutdown: true });
});

export default router;
