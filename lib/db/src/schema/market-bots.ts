import { pgTable, serial, integer, boolean, numeric, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const marketBotsTable = pgTable("market_bots", {
  id: serial("id").primaryKey(),
  pairId: integer("pair_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  spreadBps: integer("spread_bps").notNull().default(20),
  levels: integer("levels").notNull().default(5),
  priceStepBps: integer("price_step_bps").notNull().default(10),
  orderSize: numeric("order_size", { precision: 28, scale: 8 }).notNull().default("0.01"),
  refreshSec: integer("refresh_sec").notNull().default(8),
  maxOrderAgeSec: integer("max_order_age_sec").notNull().default(60),
  fillOnCross: boolean("fill_on_cross").notNull().default(true),
  spotEnabled: boolean("spot_enabled").notNull().default(true),
  futuresEnabled: boolean("futures_enabled").notNull().default(false),
  // Top-of-book boost: extra qty % on the first (closest to mid) ladder level. 100 = 2x size at top.
  topOfBookBoostPct: integer("top_of_book_boost_pct").notNull().default(50),
  // Market-taker: bot fires synthetic market trades on price moves / big orders to add momentum + absorb liquidity.
  marketTakerEnabled: boolean("market_taker_enabled").notNull().default(false),
  marketTakerSizeMult: numeric("market_taker_size_mult", { precision: 8, scale: 2 }).notNull().default("2.00"),
  // If mid moves more than this many bps since last tick, fire a market order in the direction of the move (chase).
  priceMoveTriggerBps: integer("price_move_trigger_bps").notNull().default(30),
  // If any single user (non-bot) order on opposite of mid has qty > this, fire a market order to chip away.
  bigOrderTriggerQty: numeric("big_order_trigger_qty", { precision: 28, scale: 8 }).notNull().default("0"),
  // Multiplier on orderSize when responding to a big order (e.g. 1.5 = 150% of size goes to absorb).
  bigOrderAbsorbMult: numeric("big_order_absorb_mult", { precision: 8, scale: 2 }).notNull().default("1.50"),
  marketTakerCooldownSec: integer("market_taker_cooldown_sec").notNull().default(30),
  lastMarketOrderAt: timestamp("last_market_order_at", { withTimezone: true }),
  lastMidPrice: numeric("last_mid_price", { precision: 28, scale: 8 }),
  startAt: timestamp("start_at", { withTimezone: true }),
  status: text("status").notNull().default("idle"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pairUnique: uniqueIndex("market_bots_pair_unique").on(t.pairId),
}));

export type MarketBot = typeof marketBotsTable.$inferSelect;
