import { pgTable, serial, integer, text, timestamp, numeric, varchar, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

export const futuresPositionsTable = pgTable("futures_positions", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  pairId: integer("pair_id").notNull(),
  side: text("side").notNull(),
  leverage: integer("leverage").notNull().default(10),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 28, scale: 8 }).notNull(),
  markPrice: numeric("mark_price", { precision: 28, scale: 8 }).notNull().default("0"),
  marginAmount: numeric("margin_amount", { precision: 28, scale: 8 }).notNull(),
  marginType: text("margin_type").notNull().default("isolated"),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 28, scale: 8 }).notNull().default("0"),
  liquidationPrice: numeric("liquidation_price", { precision: 28, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),
  realizedPnl: numeric("realized_pnl", { precision: 28, scale: 8 }).notNull().default("0"),
  stopLoss:    numeric("stop_loss",    { precision: 28, scale: 8 }),
  takeProfit:  numeric("take_profit",  { precision: 28, scale: 8 }),
}, (t) => ({
  byUserStatus: index("futures_positions_user_status_idx").on(t.userId, t.status),
  byPair:       index("futures_positions_pair_idx").on(t.pairId),
}));

export type FuturesPosition = typeof futuresPositionsTable.$inferSelect;

export const fundingPaymentsTable = pgTable("funding_payments", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id").notNull(),
  userId: integer("user_id").notNull(),
  pairId: integer("pair_id").notNull(),
  fundingRateId: integer("funding_rate_id").notNull(),
  rate: numeric("rate", { precision: 10, scale: 6 }).notNull(),
  positionValue: numeric("position_value", { precision: 28, scale: 8 }).notNull(),
  payment: numeric("payment", { precision: 28, scale: 8 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqRatePos: uniqueIndex("funding_payments_rate_pos_idx").on(t.fundingRateId, t.positionId),
  byUser:      index("funding_payments_user_idx").on(t.userId),
  byPair:      index("funding_payments_pair_idx").on(t.pairId),
}));

export type FundingPayment = typeof fundingPaymentsTable.$inferSelect;

// ── Futures orders (perp orderbook persistence) ──────────────────────────────
export const futuresOrdersTable = pgTable("futures_orders", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  pairId: integer("pair_id").notNull(),
  side: text("side").notNull(),                                      // 'buy' | 'sell'
  type: text("type").notNull().default("limit"),                     // 'limit' | 'market'
  price: numeric("price", { precision: 28, scale: 8 }),              // null for market
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  filledQty: numeric("filled_qty", { precision: 28, scale: 8 }).notNull().default("0"),
  avgFillPrice: numeric("avg_fill_price", { precision: 28, scale: 8 }).notNull().default("0"),
  leverage: integer("leverage").notNull().default(10),
  marginType: text("margin_type").notNull().default("isolated"),     // 'isolated' | 'cross'
  marginLocked: numeric("margin_locked", { precision: 28, scale: 8 }).notNull().default("0"),
  reduceOnly: boolean("reduce_only").notNull().default(false),
  stopLoss: numeric("stop_loss", { precision: 28, scale: 8 }),
  takeProfit: numeric("take_profit", { precision: 28, scale: 8 }),
  status: text("status").notNull().default("OPEN"),                  // OPEN | PARTIAL | FILLED | CANCELLED | REJECTED
  fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
  positionId: integer("position_id"),                                // set after first fill
  isBot: integer("is_bot").notNull().default(0),                     // 1 = synthetic liquidity (skip wallet ops)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPairStatus: index("futures_orders_pair_status_idx").on(t.pairId, t.status),
  byUserCreated: index("futures_orders_user_created_idx").on(t.userId, t.createdAt),
}));

export type FuturesOrder = typeof futuresOrdersTable.$inferSelect;

// ── Futures trades (each fill) ───────────────────────────────────────────────
export const futuresTradesTable = pgTable("futures_trades", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  pairId: integer("pair_id").notNull(),
  takerOrderId: integer("taker_order_id").notNull(),
  makerOrderId: integer("maker_order_id").notNull(),
  takerUserId: integer("taker_user_id").notNull(),
  makerUserId: integer("maker_user_id").notNull(),
  takerSide: text("taker_side").notNull(),                           // 'buy' | 'sell'
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  takerFee: numeric("taker_fee", { precision: 28, scale: 8 }).notNull().default("0"),
  makerFee: numeric("maker_fee", { precision: 28, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPairCreated: index("futures_trades_pair_created_idx").on(t.pairId, t.createdAt),
  byTakerUser: index("futures_trades_taker_user_idx").on(t.takerUserId, t.createdAt),
  byMakerUser: index("futures_trades_maker_user_idx").on(t.makerUserId, t.createdAt),
}));

export type FuturesTrade = typeof futuresTradesTable.$inferSelect;
