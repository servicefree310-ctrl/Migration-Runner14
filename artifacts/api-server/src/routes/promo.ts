import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull, lte, gte, or, sql } from "drizzle-orm";
import { db, bannersTable, promotionsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { rGet, rSet } from "../lib/redis";
import { invalidate } from "../lib/cache-warmup";
import { shouldCacheServer, getCacheTtl } from "./redis-admin";

const router: IRouter = Router();
const adminOnly = requireRole("admin", "superadmin");

// ============ PUBLIC ============
router.get("/banners", async (req, res): Promise<void> => {
  const platform = String(req.query.platform || "mobile");
  const cacheKey = `cache:banners:${platform === "web" ? "web" : "mobile"}`;
  if (await shouldCacheServer("cms.banners")) {
    const cached = await rGet(cacheKey);
    if (cached) { res.setHeader("X-Cache", "HIT"); res.json(JSON.parse(cached)); return; }
  }
  const now = new Date();
  const rows = await db.select().from(bannersTable)
    .where(and(
      eq(bannersTable.isActive, true),
      platform === "web" ? eq(bannersTable.showOnWeb, true) : eq(bannersTable.showOnMobile, true),
      or(isNull(bannersTable.startsAt), lte(bannersTable.startsAt, now))!,
      or(isNull(bannersTable.endsAt), gte(bannersTable.endsAt, now))!,
    ))
    .orderBy(asc(bannersTable.position), desc(bannersTable.id));
  if (await shouldCacheServer("cms.banners")) {
    await rSet(cacheKey, JSON.stringify(rows), await getCacheTtl("cms.banners", 120));
  }
  res.setHeader("X-Cache", "MISS");
  res.json(rows);
});

router.get("/promotions", async (_req, res): Promise<void> => {
  const cacheKey = "cache:promotions:mobile";
  if (await shouldCacheServer("cms.promotions")) {
    const cached = await rGet(cacheKey);
    if (cached) { res.setHeader("X-Cache", "HIT"); res.json(JSON.parse(cached)); return; }
  }
  const now = new Date();
  const rows = await db.select().from(promotionsTable)
    .where(and(
      eq(promotionsTable.isActive, true),
      eq(promotionsTable.showOnMobile, true),
      or(isNull(promotionsTable.startsAt), lte(promotionsTable.startsAt, now))!,
      or(isNull(promotionsTable.endsAt), gte(promotionsTable.endsAt, now))!,
    ))
    .orderBy(asc(promotionsTable.position), desc(promotionsTable.id));
  if (await shouldCacheServer("cms.promotions")) {
    await rSet(cacheKey, JSON.stringify(rows), await getCacheTtl("cms.promotions", 120));
  }
  res.setHeader("X-Cache", "MISS");
  res.json(rows);
});

// ============ ADMIN — Banners ============
router.get("/admin/banners", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(bannersTable).orderBy(asc(bannersTable.position), desc(bannersTable.id));
  res.json(rows);
});

router.post("/admin/banners", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(bannersTable).values({
    title: String(b.title),
    subtitle: String(b.subtitle || ""),
    bgColor: String(b.bgColor || "#fcd535"),
    fgColor: String(b.fgColor || "#000000"),
    icon: String(b.icon || "shield"),
    imageUrl: String(b.imageUrl || ""),
    ctaLabel: String(b.ctaLabel || ""),
    ctaUrl: String(b.ctaUrl || ""),
    position: Number(b.position ?? 0),
    isActive: b.isActive !== false,
    showOnMobile: b.showOnMobile !== false,
    showOnWeb: b.showOnWeb !== false,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
  }).returning();
  await invalidate("cache:banners:*");
  res.status(201).json(row);
});

router.patch("/admin/banners/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const upd: any = {};
  for (const k of ["title", "subtitle", "bgColor", "fgColor", "icon", "imageUrl", "ctaLabel", "ctaUrl"]) {
    if (b[k] !== undefined) upd[k] = String(b[k]);
  }
  if (b.position !== undefined) upd.position = Number(b.position);
  if (b.isActive !== undefined) upd.isActive = !!b.isActive;
  if (b.showOnMobile !== undefined) upd.showOnMobile = !!b.showOnMobile;
  if (b.showOnWeb !== undefined) upd.showOnWeb = !!b.showOnWeb;
  if (b.startsAt !== undefined) upd.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt !== undefined) upd.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  const [row] = await db.update(bannersTable).set(upd).where(eq(bannersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await invalidate("cache:banners:*");
  res.json(row);
});

router.delete("/admin/banners/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  await invalidate("cache:banners:*");
  res.json({ ok: true });
});

// ============ ADMIN — Promotions ============
router.get("/admin/promotions", adminOnly, async (_req, res): Promise<void> => {
  const rows = await db.select().from(promotionsTable).orderBy(asc(promotionsTable.position), desc(promotionsTable.id));
  res.json(rows);
});

router.post("/admin/promotions", adminOnly, async (req, res): Promise<void> => {
  const p = req.body || {};
  if (!p.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(promotionsTable).values({
    type: String(p.type || "event"),
    tag: String(p.tag || "EVENT"),
    title: String(p.title),
    subtitle: String(p.subtitle || ""),
    description: String(p.description || ""),
    color: String(p.color || "#a06af5"),
    icon: String(p.icon || "award"),
    imageUrl: String(p.imageUrl || ""),
    ctaLabel: String(p.ctaLabel || "Learn more"),
    ctaUrl: String(p.ctaUrl || ""),
    prizePool: String(p.prizePool || ""),
    position: Number(p.position ?? 0),
    isActive: p.isActive !== false,
    showOnMobile: p.showOnMobile !== false,
    startsAt: p.startsAt ? new Date(p.startsAt) : null,
    endsAt: p.endsAt ? new Date(p.endsAt) : null,
  }).returning();
  await invalidate("cache:promotions:*");
  res.status(201).json(row);
});

router.patch("/admin/promotions/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const p = req.body || {};
  const upd: any = {};
  for (const k of ["type", "tag", "title", "subtitle", "description", "color", "icon", "imageUrl", "ctaLabel", "ctaUrl", "prizePool"]) {
    if (p[k] !== undefined) upd[k] = String(p[k]);
  }
  if (p.position !== undefined) upd.position = Number(p.position);
  if (p.isActive !== undefined) upd.isActive = !!p.isActive;
  if (p.showOnMobile !== undefined) upd.showOnMobile = !!p.showOnMobile;
  if (p.startsAt !== undefined) upd.startsAt = p.startsAt ? new Date(p.startsAt) : null;
  if (p.endsAt !== undefined) upd.endsAt = p.endsAt ? new Date(p.endsAt) : null;
  const [row] = await db.update(promotionsTable).set(upd).where(eq(promotionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  await invalidate("cache:promotions:*");
  res.json(row);
});

router.delete("/admin/promotions/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(promotionsTable).where(eq(promotionsTable.id, id));
  await invalidate("cache:promotions:*");
  res.json({ ok: true });
});

export default router;
