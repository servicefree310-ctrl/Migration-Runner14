import { pgTable, text, serial, timestamp, integer, numeric, boolean, index } from "drizzle-orm/pg-core";

export const autoInvestAccountsTable = pgTable("auto_invest_accounts", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().unique(),
  balance:         numeric("balance",       { precision: 28, scale: 8 }).notNull().default("0"),
  totalDeposited:  numeric("total_deposited",{ precision: 28, scale: 8 }).notNull().default("0"),
  totalWithdrawn:  numeric("total_withdrawn",{ precision: 28, scale: 8 }).notNull().default("0"),
  totalEarned:     numeric("total_earned",  { precision: 28, scale: 8 }).notNull().default("0"),
  dailyRatePct:    numeric("daily_rate_pct",{ precision: 6,  scale: 4 }).notNull().default("0.75"),
  status:          text("status").notNull().default("active"),
  createdAt:       timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  byUser: index("auto_invest_accounts_user_idx").on(t.userId),
}));

export const autoInvestTradesTable = pgTable("auto_invest_trades", {
  id:          serial("id").primaryKey(),
  accountId:   integer("account_id").notNull(),
  userId:      integer("user_id").notNull(),
  pair:        text("pair").notNull(),
  side:        text("side").notNull(),
  entryPrice:  numeric("entry_price", { precision: 28, scale: 8 }).notNull(),
  exitPrice:   numeric("exit_price",  { precision: 28, scale: 8 }).notNull(),
  amountUsdt:  numeric("amount_usdt", { precision: 28, scale: 8 }).notNull(),
  pnlUsdt:     numeric("pnl_usdt",    { precision: 28, scale: 8 }).notNull(),
  pnlPct:      numeric("pnl_pct",     { precision: 10, scale: 6 }).notNull(),
  isWin:       boolean("is_win").notNull().default(true),
  strategy:    text("strategy").notNull().default(""),
  openedAt:    timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt:    timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  byAccount: index("auto_invest_trades_account_idx").on(t.accountId),
  byUser:    index("auto_invest_trades_user_idx").on(t.userId),
  byTime:    index("auto_invest_trades_time_idx").on(t.openedAt),
}));

export type AutoInvestAccount = typeof autoInvestAccountsTable.$inferSelect;
export type AutoInvestTrade   = typeof autoInvestTradesTable.$inferSelect;
