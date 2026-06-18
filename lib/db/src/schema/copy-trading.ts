import { pgTable, serial, integer, text, timestamp, numeric, boolean, jsonb, index, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

// Trader profiles — users who opt to be copyable
export const traderProfilesTable = pgTable("trader_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  performanceFeeBps: integer("performance_fee_bps").notNull().default(1000),
  totalPnlUsd: numeric("total_pnl_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  pnl30dPct: numeric("pnl_30d_pct", { precision: 12, scale: 4 }).notNull().default("0"),
  pnl90dPct: numeric("pnl_90d_pct", { precision: 12, scale: 4 }).notNull().default("0"),
  winRatePct: numeric("win_rate_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  followersCount: integer("followers_count").notNull().default(0),
  aumUsd: numeric("aum_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  riskScore: integer("risk_score").notNull().default(50),
  pnlAllTimePct: numeric("pnl_all_time_pct", { precision: 12, scale: 4 }).notNull().default("0"),
  maxDrawdownPct: numeric("max_drawdown_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byActivePnl: index("trader_profiles_active_pnl_idx").on(t.isActive, t.pnl30dPct),
}));
export type TraderProfile = typeof traderProfilesTable.$inferSelect;

// Copy relations — follower → trader, with allocation
export const copyRelationsTable = pgTable("copy_relations", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  followerId: integer("follower_id").notNull(),
  traderId: integer("trader_id").notNull(),
  status: text("status").notNull().default("active"),
  allocationUsd: numeric("allocation_usd", { precision: 28, scale: 8 }).notNull(),
  copyRatio: numeric("copy_ratio", { precision: 8, scale: 4 }).notNull().default("1"),
  maxRiskPerTradePct: numeric("max_risk_per_trade_pct", { precision: 6, scale: 2 }).notNull().default("5"),
  totalCopiedTrades: integer("total_copied_trades").notNull().default(0),
  totalPnlUsd: numeric("total_pnl_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
}, (t) => ({
  uniqFollowerTrader: uniqueIndex("copy_rel_follower_trader_idx").on(t.followerId, t.traderId),
  byTraderStatus: index("copy_rel_trader_status_idx").on(t.traderId, t.status),
}));
export type CopyRelation = typeof copyRelationsTable.$inferSelect;
