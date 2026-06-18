/**
 * Dashboard layouts + watchlists for the Pro Dashboard.
 *
 *   GET    /dashboard/layouts          — list caller's layouts
 *   POST   /dashboard/layouts          — create new layout
 *   PATCH  /dashboard/layouts/:id      — update layout
 *   DELETE /dashboard/layouts/:id      — delete
 *
 *   GET    /watchlists                 — list caller's watchlists
 *   POST   /watchlists                 — create watchlist
 *   PATCH  /watchlists/:id             — update symbols
 *   DELETE /watchlists/:id             — delete
 */
import { Router, type IRouter } from "express";
import { db, dashboardLayoutsTable, watchlistsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const ALLOWED_WIDGET_TYPES = new Set([
  "portfolio_value", "watchlist", "news", "trending", "open_orders",
  "recent_trades", "pnl_chart", "alerts", "fear_greed", "top_movers",
  "quick_trade", "price_ticker",
]);

function sanitizeLayout(layout: unknown): Array<{ id: string; type: string; x: number; y: number; w: number; h: number; config?: Record<string, unknown> }> {
  if (!Array.isArray(layout)) return [];
  return layout.slice(0, 30).map((w) => {
    if (typeof w !== "object" || !w) return null;
    const r = w as Record<string, unknown>;
    if (typeof r.type !== "string" || !ALLOWED_WIDGET_TYPES.has(r.type)) return null;
    return {
      id: String(r.id ?? `w-${randomUUID().slice(0, 8)}`).slice(0, 50),
      type: r.type,
      x: Math.max(0, Math.min(11, Number(r.x ?? 0))),
      y: Math.max(0, Math.min(50, Number(r.y ?? 0))),
      w: Math.max(1, Math.min(12, Number(r.w ?? 4))),
      h: Math.max(1, Math.min(12, Number(r.h ?? 3))),
      config: typeof r.config === "object" && r.config ? r.config as Record<string, unknown> : {},
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
}

// ─── Layouts ────────────────────────────────────────────────────────────────
router.get("/dashboard/layouts", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(dashboardLayoutsTable)
    .where(eq(dashboardLayoutsTable.userId, req.user!.id))
    .orderBy(desc(dashboardLayoutsTable.isDefault), desc(dashboardLayoutsTable.updatedAt));
  res.json({ items: rows });
});

router.post("/dashboard/layouts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { name, layout, isDefault } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name required" }); return; }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(dashboardLayoutsTable).where(eq(dashboardLayoutsTable.userId, userId));
  if (n >= 10) { res.status(429).json({ error: "max 10 layouts" }); return; }
  if (isDefault) {
    await db.update(dashboardLayoutsTable).set({ isDefault: 0 }).where(eq(dashboardLayoutsTable.userId, userId));
  }
  const [row] = await db.insert(dashboardLayoutsTable).values({
    userId,
    name: name.slice(0, 50),
    layout: sanitizeLayout(layout),
    isDefault: isDefault ? 1 : 0,
  }).returning();
  res.json({ layout: row });
});

router.patch("/dashboard/layouts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") updates.name = req.body.name.slice(0, 50);
  if (req.body?.layout !== undefined) updates.layout = sanitizeLayout(req.body.layout);
  if (req.body?.isDefault === true) {
    await db.update(dashboardLayoutsTable).set({ isDefault: 0 }).where(eq(dashboardLayoutsTable.userId, req.user!.id));
    updates.isDefault = 1;
  }
  const [row] = await db.update(dashboardLayoutsTable).set(updates)
    .where(and(eq(dashboardLayoutsTable.id, id), eq(dashboardLayoutsTable.userId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ layout: row });
});

router.delete("/dashboard/layouts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(dashboardLayoutsTable)
    .where(and(eq(dashboardLayoutsTable.id, id), eq(dashboardLayoutsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

// ─── Watchlists ─────────────────────────────────────────────────────────────
router.get("/watchlists", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(watchlistsTable)
    .where(eq(watchlistsTable.userId, req.user!.id))
    .orderBy(desc(watchlistsTable.updatedAt));
  res.json({ items: rows });
});

router.post("/watchlists", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { name, symbols } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name required" }); return; }
  const syms = Array.isArray(symbols) ? symbols.slice(0, 100).map((s) => String(s).toUpperCase().slice(0, 30)) : [];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
    .from(watchlistsTable).where(eq(watchlistsTable.userId, userId));
  if (n >= 10) { res.status(429).json({ error: "max 10 watchlists" }); return; }
  const [row] = await db.insert(watchlistsTable).values({
    userId, name: name.slice(0, 50), symbols: syms,
  }).returning();
  res.json({ watchlist: row });
});

router.patch("/watchlists/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof req.body?.name === "string") updates.name = req.body.name.slice(0, 50);
  if (Array.isArray(req.body?.symbols)) {
    updates.symbols = req.body.symbols.slice(0, 100).map((s: unknown) => String(s).toUpperCase().slice(0, 30));
  }
  const [row] = await db.update(watchlistsTable).set(updates)
    .where(and(eq(watchlistsTable.id, id), eq(watchlistsTable.userId, req.user!.id))).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json({ watchlist: row });
});

router.delete("/watchlists/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
  await db.delete(watchlistsTable)
    .where(and(eq(watchlistsTable.id, id), eq(watchlistsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

export default router;
