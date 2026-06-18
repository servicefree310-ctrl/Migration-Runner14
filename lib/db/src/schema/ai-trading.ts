import { pgTable, serial, text, numeric, integer, boolean, timestamp, pgEnum, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { usersTable } from "./users";
import { coinsTable } from "./coins";

export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high", "ultra"]);

export const aiTradingPlansTable = pgTable("ai_trading_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  dailyReturnPercent: numeric("daily_return_percent", { precision: 10, scale: 4 }).notNull(),
  minInvestment: numeric("min_investment", { precision: 20, scale: 8 }).notNull(),
  maxInvestment: numeric("max_investment", { precision: 20, scale: 8 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull().default("medium"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiSubStatusEnum = pgEnum("ai_sub_status", ["active", "completed", "cancelled"]);

export const aiTradingSubscriptionsTable = pgTable("ai_trading_subscriptions", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  planId: integer("plan_id").notNull().references(() => aiTradingPlansTable.id),
  investedAmount: numeric("invested_amount", { precision: 20, scale: 8 }).notNull(),
  fundingCoinId: integer("funding_coin_id").references(() => coinsTable.id),
  fundingAmount: numeric("funding_amount", { precision: 20, scale: 8 }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: aiSubStatusEnum("status").notNull().default("active"),
  totalEarned: numeric("total_earned", { precision: 20, scale: 8 }).notNull().default("0"),
  lastCreditedAt: timestamp("last_credited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiTradingEarningsTable = pgTable("ai_trading_earnings", {
  id:             serial("id").primaryKey(),
  uid:            varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId:         integer("user_id").notNull().references(() => usersTable.id),
  subscriptionId: integer("subscription_id").notNull().references(() => aiTradingSubscriptionsTable.id),
  planName:       text("plan_name").notNull(),
  amountUsdt:     numeric("amount_usdt", { precision: 20, scale: 8 }).notNull(),
  creditedAt:     timestamp("credited_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AITradingPlan = typeof aiTradingPlansTable.$inferSelect;
export type AITradingSubscription = typeof aiTradingSubscriptionsTable.$inferSelect;
export type AITradingEarning = typeof aiTradingEarningsTable.$inferSelect;
