import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const adminOnly    = requireRole("admin", "superadmin");
const marketingPlus = requireRole("admin", "superadmin", "marketing");

function parseVal(v: string): unknown {
  try { return JSON.parse(v); } catch { return v; }
}

// ── GET all seo.* settings ─────────────────────────────────────────────────
router.get("/admin/seo", marketingPlus, async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const result: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.key.startsWith("seo.")) result[r.key] = parseVal(r.value);
  }
  res.json(result);
});

// ── PUT a single seo.* key ─────────────────────────────────────────────────
router.put("/admin/seo/:key", adminOnly, async (req, res): Promise<void> => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!rawKey) { res.status(400).json({ error: "key required" }); return; }
  const key = rawKey.startsWith("seo.") ? rawKey : `seo.${rawKey}`;
  const value = typeof req.body?.value === "string"
    ? req.body.value
    : JSON.stringify(req.body?.value ?? null);

  await db.insert(settingsTable).values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });

  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  res.json({ key: row.key, value: parseVal(row.value) });
});

// ── DELETE a seo.* key ─────────────────────────────────────────────────────
router.delete("/admin/seo/:key", adminOnly, async (req, res): Promise<void> => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!rawKey) { res.status(400).json({ error: "key required" }); return; }
  const key = rawKey.startsWith("seo.") ? rawKey : `seo.${rawKey}`;
  await db.delete(settingsTable).where(eq(settingsTable.key, key));
  res.json({ ok: true });
});

// ── Public: serve robots.txt dynamically ──────────────────────────────────
router.get("/robots.txt", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(settingsTable)
    .where(eq(settingsTable.key, "seo.robots")).limit(1);
  const robots = row?.value ?? `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://zebvix.com/sitemap.xml`;
  res.type("text/plain").send(robots);
});

// ── Public: serve sitemap.xml dynamically ─────────────────────────────────
router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const sitemapRow = rows.find(r => r.key === "seo.sitemap");
  const sitemapConfig = sitemapRow ? parseVal(sitemapRow.value) as { urls?: Array<{ loc: string; priority: string; changefreq: string }> } : null;
  const brandRow = rows.find(r => r.key === "seo.global");
  const brand = brandRow ? parseVal(brandRow.value) as { canonicalBase?: string } : null;
  const base = brand?.canonicalBase ?? "https://zebvix.com";

  const defaultUrls: Array<{ loc: string; priority: string; changefreq: string }> = [
    { loc: "/",         priority: "1.0", changefreq: "daily" },
    { loc: "/markets",  priority: "0.9", changefreq: "hourly" },
    { loc: "/trade",    priority: "0.8", changefreq: "hourly" },
    { loc: "/futures",  priority: "0.8", changefreq: "hourly" },
    { loc: "/earn",     priority: "0.7", changefreq: "daily" },
    { loc: "/p2p",      priority: "0.7", changefreq: "daily" },
    { loc: "/ai-trading",priority:"0.7", changefreq: "weekly" },
    { loc: "/copy-trading",priority:"0.7",changefreq:"weekly"},
    { loc: "/blog",     priority: "0.6", changefreq: "weekly" },
    { loc: "/help",     priority: "0.5", changefreq: "weekly" },
    { loc: "/tutorials",priority: "0.6", changefreq: "weekly" },
    { loc: "/terms",    priority: "0.4", changefreq: "monthly" },
    { loc: "/privacy",  priority: "0.4", changefreq: "monthly" },
    { loc: "/fees",     priority: "0.5", changefreq: "weekly" },
    { loc: "/aml",      priority: "0.4", changefreq: "monthly" },
  ];

  const urls = (sitemapConfig?.urls ?? defaultUrls);
  const now = new Date().toISOString().split("T")[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${base}${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
  res.type("application/xml").send(xml);
});

export default router;
