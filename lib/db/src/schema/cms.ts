import { pgTable, text, serial, timestamp, integer, boolean, index, varchar } from "drizzle-orm/pg-core";

export const legalPagesTable = pgTable("legal_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LegalPage = typeof legalPagesTable.$inferSelect;

export const settingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSetting = typeof settingsTable.$inferSelect;

export const cacheConfigsTable = pgTable("cache_configs", {
  cacheKey: text("cache_key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("misc"),
  ttlSec: integer("ttl_sec").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  cacheOnServer: boolean("cache_on_server").notNull().default(true),
  cacheOnMobile: boolean("cache_on_mobile").notNull().default(true),
  cacheOnWeb: boolean("cache_on_web").notNull().default(true),
  pattern: text("pattern").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CacheConfig = typeof cacheConfigsTable.$inferSelect;

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredId: integer("referred_id").notNull(),
  commissionRate: text("commission_rate").notNull().default("30"),
  totalEarned: text("total_earned").notNull().default("0"),
  bonusCredited: boolean("bonus_credited").notNull().default(false),
  bonusAmount: text("bonus_amount").default("0"),
  level: integer("level").notNull().default(1),
  sourceType: text("source_type").notNull().default("registration"),
  /** Unique ref to the originating event (spot order, futures order, AI earning row, earn position).
   *  Format: "spot:{orderId}" | "fut:{orderId}" | "ai_earn:{earningId}" | "earn:{positionId}"
   *  Used for idempotency — same (referrerId, sourceRefId, level) is only credited once. */
  sourceRefId: varchar("source_ref_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byReferrer: index("referrals_referrer_idx").on(t.referrerId),
  byReferred: index("referrals_referred_idx").on(t.referredId),
  bySourceRef: index("referrals_source_ref_idx").on(t.referrerId, t.sourceRefId, t.level),
}));

export type Referral = typeof referralsTable.$inferSelect;

export const chatThreadsTable = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  subject: text("subject").notNull().default("Support"),
  status: text("status").notNull().default("open"),
  assigneeId: integer("assignee_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("chat_threads_user_idx").on(t.userId),
}));

export type ChatThread = typeof chatThreadsTable.$inferSelect;

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  senderId: integer("sender_id").notNull(),
  senderRole: text("sender_role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byThread: index("chat_messages_thread_idx").on(t.threadId),
}));

export type ChatMessage = typeof chatMessagesTable.$inferSelect;

export const bannersTable = pgTable("home_banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  bgColor: text("bg_color").notNull().default("#fcd535"),
  fgColor: text("fg_color").notNull().default("#000000"),
  icon: text("icon").notNull().default("shield"),
  imageUrl: text("image_url").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  showOnMobile: boolean("show_on_mobile").notNull().default(true),
  showOnWeb: boolean("show_on_web").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Banner = typeof bannersTable.$inferSelect;

export const promotionsTable = pgTable("home_promotions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("event"),
  tag: text("tag").notNull().default("EVENT"),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#a06af5"),
  icon: text("icon").notNull().default("award"),
  imageUrl: text("image_url").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default("Learn more"),
  ctaUrl: text("cta_url").notNull().default(""),
  prizePool: text("prize_pool").notNull().default(""),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  showOnMobile: boolean("show_on_mobile").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Promotion = typeof promotionsTable.$inferSelect;

// ── Announcements (product / security / promo / maintenance updates) ──────────
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  category: text("category").notNull().default("product"), // product|security|maintenance|promotion|listing
  ctaLabel: text("cta_label").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  isPinned: boolean("is_pinned").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Announcement = typeof announcementsTable.$inferSelect;

// ── News (longer-form market / product articles) ──────────────────────────────
export const newsItemsTable = pgTable("news_items", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull().default(""),
  category: text("category").notNull().default("market"), // market|product|insight|tutorial|press
  coverImageUrl: text("cover_image_url").notNull().default(""),
  source: text("source").notNull().default("Zebvix"),
  sourceUrl: text("source_url").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  isPublished: boolean("is_published").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  position: integer("position").notNull().default(0),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type NewsItem = typeof newsItemsTable.$inferSelect;

// ── Competitions (Trading Leagues / contests) ─────────────────────────────────
export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  prizePool: text("prize_pool").notNull().default("0"),
  prizeUnit: text("prize_unit").notNull().default("USDT"),
  topPrize: text("top_prize").notNull().default("0"),
  rewardTiersJson: text("reward_tiers_json").notNull().default("[]"), // [{rank, label, prize}]
  rulesJson: text("rules_json").notNull().default("[]"),              // ["...", "..."]
  heroIcon: text("hero_icon").notNull().default("trophy"),
  heroColor: text("hero_color").notNull().default("#fcd535"),
  joinUrl: text("join_url").notNull().default(""),
  scoringRule: text("scoring_rule").notNull().default("roi"), // roi|volume|pnl
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: text("status").notNull().default("upcoming"), // upcoming|active|finished
  isFeatured: boolean("is_featured").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(true),
  position: integer("position").notNull().default(0),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type Competition = typeof competitionsTable.$inferSelect;

// ── Broadcast notifications (admin → all users, header bell) ──────────────────
export const broadcastNotificationsTable = pgTable("broadcast_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  kind: text("kind").notNull().default("info"), // info|success|warning|danger
  ctaLabel: text("cta_label").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  audience: text("audience").notNull().default("all"), // all|auth|guest
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type BroadcastNotification = typeof broadcastNotificationsTable.$inferSelect;

// ── Team Members ──────────────────────────────────────────────────────────────
export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  twitterUrl: text("twitter_url").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type TeamMember = typeof teamMembersTable.$inferSelect;

// ── Company Media ─────────────────────────────────────────────────────────────
export const companyMediaTable = pgTable("company_media", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("general"),
  title: text("title").notNull().default(""),
  caption: text("caption").notNull().default(""),
  url: text("url").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type CompanyMedia = typeof companyMediaTable.$inferSelect;
