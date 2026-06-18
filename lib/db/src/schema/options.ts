import { pgTable, serial, integer, text, timestamp, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";

// ─── Option contracts (admin-listed) ─────────────────────────────────────────
// One row per tradable option: e.g. "BTC-30MAY26-50000-C". The symbol is
// human-friendly and unique; the underlying coin is referenced by id so we can
// price/settle off the live spot price (coins.currentPrice).
//
// ivBps = implied volatility in basis points (10000 = 100%). Admin sets a
// per-contract IV; in v1 we don't surface market-quoted IV. The Black-Scholes
// pricer uses ivBps/10000 as σ.
//
// statuses:  active → expired → settled
//   active   = open for new orders, mark price moves with spot
//   expired  = passed expiry, awaiting settlement (next engine tick)
//   settled  = engine has computed payoff, debited/credited holders, frozen
export const optionContractsTable = pgTable("option_contracts", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),                       // e.g. BTC-30MAY26-50000-C
  underlyingCoinId: integer("underlying_coin_id").notNull(),       // FK coins.id
  quoteCoinSymbol: text("quote_coin_symbol").notNull().default("USDT"), // settlement asset
  optionType: text("option_type").notNull(),                       // 'call' | 'put'
  strikePrice: numeric("strike_price", { precision: 28, scale: 8 }).notNull(),
  expiryAt: timestamp("expiry_at", { withTimezone: true }).notNull(),
  ivBps: integer("iv_bps").notNull().default(8000),                // implied vol in bps; default 80%
  riskFreeRateBps: integer("risk_free_rate_bps").notNull().default(500), // 5%
  contractSize: numeric("contract_size", { precision: 28, scale: 8 }).notNull().default("1"), // multiplier
  minQty: numeric("min_qty", { precision: 28, scale: 8 }).notNull().default("0.01"),
  status: text("status").notNull().default("active"),              // active | expired | settled
  settlementPrice: numeric("settlement_price", { precision: 28, scale: 8 }), // set on settle
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStatusExpiry: index("option_contracts_status_expiry_idx").on(t.status, t.expiryAt),
  byUnderlying: index("option_contracts_underlying_idx").on(t.underlyingCoinId, t.expiryAt),
}));
export type OptionContract = typeof optionContractsTable.$inferSelect;

// ─── Option orders (premium-paid market orders against the quoted mark) ──────
// v1 is intentionally simple: market-only against the live Black-Scholes mark.
// No order book — every order fills instantly at mark + a configurable spread.
// This matches Deribit's "trade-at-mark" mode for retail.
export const optionOrdersTable = pgTable("option_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contractId: integer("contract_id").notNull(),
  side: text("side").notNull(),                          // 'buy' | 'sell'
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  premium: numeric("premium", { precision: 28, scale: 8 }).notNull(), // total premium paid/received
  markPriceAtFill: numeric("mark_price_at_fill", { precision: 28, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("FILLED"),    // FILLED | REJECTED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("option_orders_user_idx").on(t.userId, t.createdAt),
  byContract: index("option_orders_contract_idx").on(t.contractId, t.createdAt),
}));
export type OptionOrder = typeof optionOrdersTable.$inferSelect;

// ─── Option positions (one row per (user, contract, side) pair, netted) ──────
// A long position is created when a user BUYS and short when they SELL. We
// keep buys and sells as separate rows to allow shorting (sell-to-open) with
// distinct margin requirements vs naked long premium-paid positions.
//
// avgEntryPremium tracks weighted average so additional fills update it.
// status:  open → closed (manually) | settled (auto, by engine on expiry)
//   marginLocked: collateral held against shorts; 0 for longs (premium upfront).
export const optionPositionsTable = pgTable("option_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contractId: integer("contract_id").notNull(),
  side: text("side").notNull(),                          // 'long' | 'short'
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  avgEntryPremium: numeric("avg_entry_premium", { precision: 28, scale: 8 }).notNull(),
  marginLocked: numeric("margin_locked", { precision: 28, scale: 8 }).notNull().default("0"),
  realizedPnl: numeric("realized_pnl", { precision: 28, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("open"),      // open | closed | settled
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),                     // 'user_close' | 'expiry_settle' | 'liquidation'
}, (t) => ({
  byUser: index("option_positions_user_idx").on(t.userId, t.status),
  uniqOpenPerContractSide: uniqueIndex("option_positions_open_uniq_idx").on(t.userId, t.contractId, t.side, t.status),
}));
export type OptionPosition = typeof optionPositionsTable.$inferSelect;
