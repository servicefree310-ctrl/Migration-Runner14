import { pgTable, serial, integer, text, timestamp, boolean, numeric, jsonb, index } from "drizzle-orm/pg-core";

// Per-user notifications (delivered via bell + /notifications page)
export const userNotificationsTable = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  kind: text("kind").notNull(),
  category: text("category").notNull().default("system"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserCreated: index("user_notif_user_created_idx").on(t.userId, t.createdAt),
  byUserUnread: index("user_notif_user_unread_idx").on(t.userId, t.readAt),
}));
export type UserNotification = typeof userNotificationsTable.$inferSelect;

// Price alerts: trigger a notification when symbol crosses target
export const priceAlertsTable = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  coinSymbol: text("coin_symbol").notNull(),
  condition: text("condition").notNull(),
  targetPrice: numeric("target_price", { precision: 28, scale: 8 }).notNull(),
  triggerOnce: boolean("trigger_once").notNull().default(true),
  status: text("status").notNull().default("active"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  triggeredPrice: numeric("triggered_price", { precision: 28, scale: 8 }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserStatus: index("price_alerts_user_status_idx").on(t.userId, t.status),
  bySymbol: index("price_alerts_symbol_status_idx").on(t.coinSymbol, t.status),
}));
export type PriceAlert = typeof priceAlertsTable.$inferSelect;
