import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getEngine } from "../lib/inmem-engine";

// Admin-only HTTP surface for the in-memory matching engine.
//
// IMPORTANT: This engine is a PARALLEL system to the existing Redis+Postgres
// matching engine in `lib/matching-engine.ts`. Orders placed here do NOT
// move user wallets and do NOT show up in /orders or the real order book —
// it's a sandbox/benchmark playground for low-latency matching.
//
// Once the engine is benchmarked and the settlement layer (wallet
// transfers, fee charging, TDS, trade persistence) is wired to consume
// the `engine.events.on("trade", ...)` stream, this module becomes the
// canonical matching authority and the legacy engine retires. Until then,
// it lives behind /admin so curious operators can poke it without risk.

const router: IRouter = Router();
const adminOnly = [requireAuth, requireRole("admin", "superadmin")];

const PlaceBody = z.object({
  symbol: z.string().min(1).max(32),
  side: z.enum(["buy", "sell"]),
  price: z.number().finite().positive(),
  quantity: z.number().finite().positive(),
  ref: z.string().max(64).optional(),
}).strict();

router.post("/admin/inmem-engine/orders", ...adminOnly, async (req, res): Promise<void> => {
  const parsed = PlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid order", errors: parsed.error.flatten() });
    return;
  }
  const engine = await getEngine();
  const result = await engine.placeOrder(parsed.data);
  res.status(201).json(result);
});

router.delete("/admin/inmem-engine/orders/:symbol/:id", ...adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: "Invalid order id" });
    return;
  }
  const symbol = String(req.params.symbol);
  const engine = await getEngine();
  const result = await engine.cancelOrder(symbol, id);
  if (!result.cancelled) {
    res.status(404).json({ message: "Order not resting in book (already filled or never existed)" });
    return;
  }
  res.json(result);
});

router.get("/admin/inmem-engine/orderbook/:symbol", ...adminOnly, async (req, res): Promise<void> => {
  const levels = Number(req.query["levels"] ?? 20);
  const safeLevels = Number.isFinite(levels) && levels > 0 ? Math.min(levels, 200) : 20;
  const symbol = String(req.params.symbol);
  const engine = await getEngine();
  res.json(engine.getOrderbook(symbol, safeLevels));
});

router.get("/admin/inmem-engine/metrics", ...adminOnly, async (_req, res): Promise<void> => {
  const engine = await getEngine();
  res.json(engine.metrics());
});

router.post("/admin/inmem-engine/snapshot", ...adminOnly, async (_req, res): Promise<void> => {
  const engine = await getEngine();
  await engine.snapshotNow();
  res.json({ ok: true, ...engine.metrics() });
});

export default router;
