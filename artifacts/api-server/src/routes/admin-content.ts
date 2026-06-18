// Admin CRUD for the new CMS surfaces: site config, announcements, news,
// competitions, broadcast notifications. Banners/promotions/legal/settings
// live in routes/admin.ts. All routes are gated by admin/superadmin role
// (writes) or support+ (reads).

import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  settingsTable,
  announcementsTable,
  newsItemsTable,
  competitionsTable,
  broadcastNotificationsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const adminOnly = requireRole("admin", "superadmin");
const supportPlus = requireRole("admin", "superadmin", "support");

// ─── Site config ──────────────────────────────────────────────────────────────
const SITE_KEYS = ["site.brand", "site.maintenance", "site.features", "site.footer", "site.banner_strip"] as const;

router.get("/admin/site-config", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  res.json(map);
});

router.put("/admin/site-config/:key", adminOnly, async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  if (!SITE_KEYS.includes(key as any) && !key.startsWith("site.")) {
    res.status(400).json({ error: "key must start with 'site.'" });
    return;
  }
  const value = typeof req.body?.value === "string" ? req.body.value : JSON.stringify(req.body?.value ?? "");
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  res.json(row);
});

// One-shot toggle for maintenance mode (convenience)
router.post("/admin/site-config/maintenance", adminOnly, async (req, res): Promise<void> => {
  const enabled = !!req.body?.enabled;
  const message = String(req.body?.message ?? "");
  const eta = String(req.body?.eta ?? "");
  const value = JSON.stringify({ enabled, message, eta });
  await db
    .insert(settingsTable)
    .values({ key: "site.maintenance", value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  res.json({ key: "site.maintenance", value: JSON.parse(value) });
});

// ─── Announcements ────────────────────────────────────────────────────────────
router.get("/admin/announcements", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.publishedAt));
  res.json(rows);
});

router.post("/admin/announcements", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(announcementsTable).values({
    title: String(b.title),
    body: String(b.body ?? ""),
    category: String(b.category ?? "product"),
    ctaLabel: String(b.ctaLabel ?? ""),
    ctaUrl: String(b.ctaUrl ?? ""),
    isPinned: !!b.isPinned,
    isPublished: b.isPublished !== false,
    publishedAt: b.publishedAt ? new Date(b.publishedAt) : new Date(),
    expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
    position: Number(b.position ?? 0),
    updatedBy: req.user?.id ?? null,
  }).returning();
  res.json(row);
});

router.patch("/admin/announcements/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const b = req.body || {};
  const patch: any = { updatedBy: req.user?.id ?? null };
  for (const k of ["title","body","category","ctaLabel","ctaUrl","position"] as const) {
    if (b[k] !== undefined) patch[k] = typeof b[k] === "number" ? b[k] : String(b[k]);
  }
  for (const k of ["isPinned","isPublished"] as const) {
    if (b[k] !== undefined) patch[k] = !!b[k];
  }
  if (b.publishedAt !== undefined) patch.publishedAt = b.publishedAt ? new Date(b.publishedAt) : new Date();
  if (b.expiresAt !== undefined) patch.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  const [row] = await db.update(announcementsTable).set(patch).where(eq(announcementsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/announcements/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  res.json({ ok: true });
});

// ─── News ─────────────────────────────────────────────────────────────────────
router.get("/admin/news", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsItemsTable).orderBy(desc(newsItemsTable.publishedAt));
  res.json(rows);
});

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || `news-${Date.now()}`;
}

router.post("/admin/news", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  let slug = b.slug ? String(b.slug).trim() : slugify(String(b.title));
  // ensure unique
  const [exists] = await db.select({ id: newsItemsTable.id }).from(newsItemsTable).where(eq(newsItemsTable.slug, slug)).limit(1);
  if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const [row] = await db.insert(newsItemsTable).values({
    slug,
    title: String(b.title),
    excerpt: String(b.excerpt ?? ""),
    body: String(b.body ?? ""),
    category: String(b.category ?? "market"),
    coverImageUrl: String(b.coverImageUrl ?? ""),
    source: String(b.source ?? "Zebvix"),
    sourceUrl: String(b.sourceUrl ?? ""),
    publishedAt: b.publishedAt ? new Date(b.publishedAt) : new Date(),
    isPublished: b.isPublished !== false,
    isFeatured: !!b.isFeatured,
    position: Number(b.position ?? 0),
    updatedBy: req.user?.id ?? null,
  }).returning();
  res.json(row);
});

router.patch("/admin/news/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const b = req.body || {};
  const patch: any = { updatedBy: req.user?.id ?? null };
  for (const k of ["title","slug","excerpt","body","category","coverImageUrl","source","sourceUrl","position"] as const) {
    if (b[k] !== undefined) patch[k] = typeof b[k] === "number" ? b[k] : String(b[k]);
  }
  for (const k of ["isPublished","isFeatured"] as const) {
    if (b[k] !== undefined) patch[k] = !!b[k];
  }
  if (b.publishedAt !== undefined) patch.publishedAt = b.publishedAt ? new Date(b.publishedAt) : new Date();
  const [row] = await db.update(newsItemsTable).set(patch).where(eq(newsItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/news/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  await db.delete(newsItemsTable).where(eq(newsItemsTable.id, id));
  res.json({ ok: true });
});

// ─── Competitions ─────────────────────────────────────────────────────────────
router.get("/admin/competitions", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(competitionsTable).orderBy(desc(competitionsTable.isFeatured), desc(competitionsTable.startsAt));
  res.json(rows);
});

router.post("/admin/competitions", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(competitionsTable).values({
    title: String(b.title),
    subtitle: String(b.subtitle ?? ""),
    description: String(b.description ?? ""),
    prizePool: String(b.prizePool ?? "0"),
    prizeUnit: String(b.prizeUnit ?? "USDT"),
    topPrize: String(b.topPrize ?? "0"),
    rewardTiersJson: JSON.stringify(Array.isArray(b.rewardTiers) ? b.rewardTiers : []),
    rulesJson: JSON.stringify(Array.isArray(b.rules) ? b.rules : []),
    heroIcon: String(b.heroIcon ?? "trophy"),
    heroColor: String(b.heroColor ?? "#fcd535"),
    joinUrl: String(b.joinUrl ?? ""),
    scoringRule: String(b.scoringRule ?? "roi"),
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    status: String(b.status ?? "upcoming"),
    isFeatured: !!b.isFeatured,
    isPublished: b.isPublished !== false,
    position: Number(b.position ?? 0),
    updatedBy: req.user?.id ?? null,
  }).returning();
  res.json(row);
});

router.patch("/admin/competitions/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const b = req.body || {};
  const patch: any = { updatedBy: req.user?.id ?? null };
  for (const k of ["title","subtitle","description","prizePool","prizeUnit","topPrize","heroIcon","heroColor","joinUrl","scoringRule","status","position"] as const) {
    if (b[k] !== undefined) patch[k] = typeof b[k] === "number" ? b[k] : String(b[k]);
  }
  for (const k of ["isFeatured","isPublished"] as const) {
    if (b[k] !== undefined) patch[k] = !!b[k];
  }
  if (b.rewardTiers !== undefined) patch.rewardTiersJson = JSON.stringify(Array.isArray(b.rewardTiers) ? b.rewardTiers : []);
  if (b.rules !== undefined) patch.rulesJson = JSON.stringify(Array.isArray(b.rules) ? b.rules : []);
  if (b.startsAt !== undefined) patch.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt !== undefined) patch.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  const [row] = await db.update(competitionsTable).set(patch).where(eq(competitionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/competitions/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  await db.delete(competitionsTable).where(eq(competitionsTable.id, id));
  res.json({ ok: true });
});

// ── Auto-create monthly competition (25 000 USDT standard template) ──────────
router.post("/admin/competitions/monthly", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};

  // Allow caller to override year/month; default to current UTC month
  const now  = new Date();
  const year  = Number(b.year  ?? now.getUTCFullYear());
  const month = Number(b.month ?? now.getUTCMonth() + 1); // 1-based
  if (month < 1 || month > 12 || year < 2024) { res.status(400).json({ error: "Invalid year/month" }); return; }

  const monthName  = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long" });
  const startsAt   = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const lastDay    = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endsAt     = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
  const status     = isCurrentMonth ? "active" : (startsAt > now ? "upcoming" : "finished");

  // Count existing competitions to derive season number
  const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(competitionsTable);
  const season = Number(cnt ?? 0) + 1;

  const rewardTiers = [
    { rank: "1",    label: "Champion",    prize: "500 USDT",  extra: "+ Diamond Badge",   tone: "amber"   },
    { rank: "2",    label: "Runner-up",   prize: "200 USDT",  extra: "+ Gold Badge",      tone: "zinc"    },
    { rank: "3",    label: "Third Place", prize: "100 USDT",  extra: "+ Silver Badge",    tone: "orange"  },
    { rank: "4-10", label: "Top 10",      prize: "20 USDT",   extra: "+ Bronze Badge",   tone: "orange"  },
    { rank: "11-25",label: "Top 25",      prize: "4 USDT",    extra: "+ Participant NFT", tone: "emerald" },
  ];

  const rules = [
    "Valid for KYC Level 2 (Aadhaar + selfie) verified users only.",
    "Trading volume from Spot, Futures and Convert all count.",
    "Minimum 10 trades required to be eligible for prizes.",
    "Season runs from 1st to last day of the month (IST).",
    "Prize distributed within 7 days of season end to your USDT wallet.",
    "TDS @ 1% applicable per Section 194S of the Income Tax Act.",
    "Zebvix reserves the right to disqualify wash trading or bot activity.",
  ];

  const [row] = await db.insert(competitionsTable).values({
    title:           `Zebvix Trading Champions — ${monthName} ${year}`,
    subtitle:        `Season ${season} · ${monthName} ${year}`,
    description:     `Compete with India's top traders for ${monthName} ${year}. Highest trading volume wins a share of the 1,000 USDT prize pool. Spot, Futures & Convert — everything counts. Top 25 traders win!`,
    prizePool:       "1000",
    prizeUnit:       "USDT",
    topPrize:        "500",
    rewardTiersJson: JSON.stringify(rewardTiers),
    rulesJson:       JSON.stringify(rules),
    heroIcon:        "trophy",
    heroColor:       "#fcd535",
    joinUrl:         "/leagues",
    scoringRule:     String(b.scoringRule ?? "volume"),
    startsAt,
    endsAt,
    status,
    isFeatured:      true,
    isPublished:     true,
    position:        0,
    updatedBy:       req.user?.id ?? null,
  }).returning();

  res.json(row);
});

// ─── Broadcast notifications ──────────────────────────────────────────────────
router.get("/admin/broadcast-notifications", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(broadcastNotificationsTable)
    .orderBy(desc(broadcastNotificationsTable.createdAt));
  res.json(rows);
});

router.post("/admin/broadcast-notifications", adminOnly, async (req, res): Promise<void> => {
  const b = req.body || {};
  if (!b.title) { res.status(400).json({ error: "title required" }); return; }
  const [row] = await db.insert(broadcastNotificationsTable).values({
    title: String(b.title),
    body: String(b.body ?? ""),
    kind: String(b.kind ?? "info"),
    ctaLabel: String(b.ctaLabel ?? ""),
    ctaUrl: String(b.ctaUrl ?? ""),
    audience: String(b.audience ?? "all"),
    isActive: b.isActive !== false,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    updatedBy: req.user?.id ?? null,
  }).returning();
  res.json(row);
});

router.patch("/admin/broadcast-notifications/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  const b = req.body || {};
  const patch: any = { updatedBy: req.user?.id ?? null };
  for (const k of ["title","body","kind","ctaLabel","ctaUrl","audience"] as const) {
    if (b[k] !== undefined) patch[k] = String(b[k]);
  }
  if (b.isActive !== undefined) patch.isActive = !!b.isActive;
  if (b.startsAt !== undefined) patch.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt !== undefined) patch.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  const [row] = await db.update(broadcastNotificationsTable).set(patch).where(eq(broadcastNotificationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/broadcast-notifications/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id required" }); return; }
  await db.delete(broadcastNotificationsTable).where(eq(broadcastNotificationsTable.id, id));
  res.json({ ok: true });
});

export default router;
