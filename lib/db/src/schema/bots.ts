import { pgTable, serial, integer, text, timestamp, numeric, boolean, jsonb, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

// User-created trading bots (Grid, DCA, Smart Rebalance)
export const tradingBotsTable = pgTable("trading_bots", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  botType: text("bot_type").notNull(),
  symbol: text("symbol").notNull(),
  baseSymbol: text("base_symbol").notNull(),
  quoteSymbol: text("quote_symbol").notNull(),
  status: text("status").notNull().default("stopped"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  totalInvestedUsd: numeric("total_invested_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  realizedPnlUsd: numeric("realized_pnl_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  unrealizedPnlUsd: numeric("unrealized_pnl_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  totalTrades: integer("total_trades").notNull().default(0),
  successfulTrades: integer("successful_trades").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserStatus: index("bots_user_status_idx").on(t.userId, t.status),
  byStatus: index("bots_status_idx").on(t.status),
}));
export type TradingBot = typeof tradingBotsTable.$inferSelect;

// Trades executed by bots (audit trail)
export const botTradesTable = pgTable("bot_trades", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull(),
  userId: integer("user_id").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  notional: numeric("notional", { precision: 28, scale: 8 }).notNull(),
  pnlUsd: numeric("pnl_usd", { precision: 28, scale: 8 }).notNull().default("0"),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byBot: index("bot_trades_bot_idx").on(t.botId, t.createdAt),
}));
export type BotTrade = typeof botTradesTable.$inferSelect;
