// Public CMS read endpoints — consumed by user-portal (site-config, footer,
// feature flags, announcements, news, competitions, broadcast notifications,
// chains list). All endpoints are unauthenticated.

import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNull, lte, or, gte, sql } from "drizzle-orm";
import {
  db,
  settingsTable,
  announcementsTable,
  newsItemsTable,
  competitionsTable,
  broadcastNotificationsTable,
  networksTable,
  coinsTable,
  bannersTable,
  promotionsTable,
} from "@workspace/db";
import { optionalAuth } from "../middlewares/auth";

const router: IRouter = Router();

// ── Site config (typed view of app_settings + sane defaults) ─────────────────
const SITE_KEYS = [
  "site.brand",
  "site.maintenance",
  "site.features",
  "site.footer",
  "site.banner_strip",
  "site.geo",
] as const;

const DEFAULT_BRAND = {
  name: "Zebvix",
  tagline: "India's pro-grade crypto exchange.",
  copyright: "© Zebvix Technologies Pvt Ltd. All rights reserved.",
  supportEmail: "support@zebvix.com",
};

const DEFAULT_MAINTENANCE = {
  enabled: false,
  message: "Hum thodi der ke liye maintenance par hain. Jaldi wapas aate hain.",
  eta: "",
};

const DEFAULT_FEATURES = {
  showFutures: true,
  showP2P: true,
  showConvert: true,
  showEarn: true,
  showLeagues: true,
  showNews: true,
  showAnnouncements: true,
  showDex: true,
  showTools: true,
  showSignup: true,
  showLogin: true,
  signupBonusZbx: 50,
};

const DEFAULT_FOOTER = {
  columns: [
    {
      title: "Products",
      links: [
        { label: "Spot trading", href: "/trade" },
        { label: "Perpetual futures", href: "/futures" },
        { label: "Markets", href: "/markets" },
        { label: "Wallet", href: "/wallet" },
        { label: "Convert", href: "/convert" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Zebvix", href: "/about" },
        { label: "Careers", href: "/careers" },
        { label: "Blog", href: "/blog" },
        { label: "Press", href: "/press" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Help center", href: "/help" },
        { label: "Submit a request", href: "/support" },
        { label: "API documentation", href: "/docs/api" },
        { label: "Fee schedule", href: "/fees" },
        { label: "System status", href: "/status" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of service", href: "/legal/terms" },
        { label: "Privacy policy", href: "/legal/privacy" },
        { label: "Risk disclosure", href: "/legal/risk" },
        { label: "AML / KYC policy", href: "/legal/aml" },
        { label: "Cookies", href: "/legal/cookies" },
      ],
    },
  ],
  socials: [
    { label: "Twitter", href: "https://twitter.com/zebvix", kind: "twitter" },
    { label: "Telegram", href: "https://t.me/zebvix", kind: "telegram" },
    { label: "Instagram", href: "https://instagram.com/zebvix", kind: "instagram" },
    { label: "YouTube", href: "https://youtube.com/@zebvix", kind: "youtube" },
    { label: "GitHub", href: "https://github.com/zebvix", kind: "github" },
  ],
  badges: [
    { label: "ISO 27001", kind: "shield" },
    { label: "SOC 2 Type II", kind: "lock" },
    { label: "FIU-IND registration pending", kind: "award" },
  ],
  riskWarning:
    "Crypto-asset trading is subject to high market risk and price volatility. The value of your investment can go down as well as up, and you may not get back the amount you invested.",
};

const DEFAULT_BANNER_STRIP = {
  enabled: false,
  message: "",
  ctaLabel: "",
  ctaUrl: "",
  kind: "info" as "info" | "success" | "warning" | "danger",
};

const DEFAULT_GEO = {
  mode: "blocklist" as "blocklist" | "allowlist",
  blockedCountries: [] as string[],
  allowedCountries: [] as string[],
};

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return { ...fallback, ...JSON.parse(raw) } as T; } catch { return fallback; }
}

router.get("/content/site-config", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(inArray(settingsTable.key, SITE_KEYS as unknown as string[]));
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.key] = r.value; });

  res.set("Cache-Control", "public, max-age=15");
  res.json({
    brand: parseJson(map["site.brand"], DEFAULT_BRAND),
    maintenance: parseJson(map["site.maintenance"], DEFAULT_MAINTENANCE),
    features: parseJson(map["site.features"], DEFAULT_FEATURES),
    footer: parseJson(map["site.footer"], DEFAULT_FOOTER),
    bannerStrip: parseJson(map["site.banner_strip"], DEFAULT_BANNER_STRIP),
    geo: parseJson(map["site.geo"], DEFAULT_GEO),
  });
});

// ── Announcements ────────────────────────────────────────────────────────────
router.get("/content/announcements", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const category = typeof req.query.category === "string" ? req.query.category : null;

  const now = new Date();
  let where: any = and(
    eq(announcementsTable.isPublished, true),
    or(isNull(announcementsTable.expiresAt), gte(announcementsTable.expiresAt, now)),
  );
  if (category) where = and(where, eq(announcementsTable.category, category));

  const rows = await db
    .select()
    .from(announcementsTable)
    .where(where)
    .orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.publishedAt))
    .limit(limit);

  res.set("Cache-Control", "public, max-age=30");
  res.json(rows);
});

// ── News ─────────────────────────────────────────────────────────────────────
router.get("/content/news", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const category = typeof req.query.category === "string" ? req.query.category : null;

  let where: any = eq(newsItemsTable.isPublished, true);
  if (category) where = and(where, eq(newsItemsTable.category, category));

  const rows = await db
    .select({
      id: newsItemsTable.id,
      slug: newsItemsTable.slug,
      title: newsItemsTable.title,
      excerpt: newsItemsTable.excerpt,
      category: newsItemsTable.category,
      coverImageUrl: newsItemsTable.coverImageUrl,
      source: newsItemsTable.source,
      sourceUrl: newsItemsTable.sourceUrl,
      publishedAt: newsItemsTable.publishedAt,
      isFeatured: newsItemsTable.isFeatured,
    })
    .from(newsItemsTable)
    .where(where)
    .orderBy(desc(newsItemsTable.isFeatured), desc(newsItemsTable.publishedAt))
    .limit(limit);

  res.set("Cache-Control", "public, max-age=30");
  res.json(rows);
});

router.get("/content/news/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  if (!slug) { res.status(400).json({ error: "slug required" }); return; }
  const [row] = await db
    .select()
    .from(newsItemsTable)
    .where(and(eq(newsItemsTable.slug, slug), eq(newsItemsTable.isPublished, true)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── Competitions ─────────────────────────────────────────────────────────────
router.get("/content/competitions", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.isPublished, true))
    .orderBy(desc(competitionsTable.isFeatured), desc(competitionsTable.startsAt));

  res.set("Cache-Control", "public, max-age=30");
  res.json(rows.map((r) => ({
    ...r,
    rewardTiers: safeParseArray(r.rewardTiersJson),
    rules: safeParseArray(r.rulesJson),
  })));
});

function safeParseArray(raw: string): any[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ── Broadcast notifications (header bell, in-app banners) ────────────────────
// Audience filter: anonymous requests get "all" + "guest"; authenticated requests
// get "all" + "auth". Cache is private when authenticated to avoid cross-leak.
router.get("/content/notifications", optionalAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const isAuth = Boolean((req as any).user?.id);
  const allowedAudiences = isAuth ? ["all", "auth"] : ["all", "guest"];

  const rows = await db
    .select()
    .from(broadcastNotificationsTable)
    .where(and(
      eq(broadcastNotificationsTable.isActive, true),
      inArray(broadcastNotificationsTable.audience, allowedAudiences),
      or(isNull(broadcastNotificationsTable.startsAt), lte(broadcastNotificationsTable.startsAt, now)),
      or(isNull(broadcastNotificationsTable.endsAt), gte(broadcastNotificationsTable.endsAt, now)),
    ))
    .orderBy(desc(broadcastNotificationsTable.createdAt))
    .limit(20);

  // Private cache when audience depends on auth state.
  res.set("Cache-Control", isAuth ? "private, max-age=15" : "public, max-age=15");
  res.json(rows);
});

// ── Chains (active networks grouped by coin) ─────────────────────────────────
router.get("/content/chains", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: networksTable.id,
      coinId: networksTable.coinId,
      coinSymbol: coinsTable.symbol,
      coinName: coinsTable.name,
      name: networksTable.name,
      chain: networksTable.chain,
      depositEnabled: networksTable.depositEnabled,
      withdrawEnabled: networksTable.withdrawEnabled,
      minDeposit: networksTable.minDeposit,
      minWithdraw: networksTable.minWithdraw,
      withdrawFee: networksTable.withdrawFee,
      confirmations: networksTable.confirmations,
      memoRequired: networksTable.memoRequired,
      explorerUrl: networksTable.explorerUrl,
      status: networksTable.status,
    })
    .from(networksTable)
    .innerJoin(coinsTable, eq(networksTable.coinId, coinsTable.id))
    .where(and(eq(networksTable.status, "active"), eq(coinsTable.isListed, true)))
    .orderBy(asc(coinsTable.symbol), asc(networksTable.chain));

  res.set("Cache-Control", "public, max-age=60");
  res.json(rows);
});

// ── Banners + Promotions (already managed by admin via /admin/banners) ───────
// These are public read aliases for the user-portal home hero strip.
router.get("/content/banners", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select()
    .from(bannersTable)
    .where(and(
      eq(bannersTable.isActive, true),
      eq(bannersTable.showOnWeb, true),
      or(isNull(bannersTable.startsAt), lte(bannersTable.startsAt, now)),
      or(isNull(bannersTable.endsAt), gte(bannersTable.endsAt, now)),
    ))
    .orderBy(asc(bannersTable.position));

  res.set("Cache-Control", "public, max-age=30");
  res.json(rows);
});

router.get("/content/promotions", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select()
    .from(promotionsTable)
    .where(and(
      eq(promotionsTable.isActive, true),
      or(isNull(promotionsTable.startsAt), lte(promotionsTable.startsAt, now)),
      or(isNull(promotionsTable.endsAt), gte(promotionsTable.endsAt, now)),
    ))
    .orderBy(asc(promotionsTable.position));

  res.set("Cache-Control", "public, max-age=30");
  res.json(rows);
});

export default router;
