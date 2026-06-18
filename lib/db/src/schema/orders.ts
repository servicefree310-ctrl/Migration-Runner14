import { pgTable, text, serial, timestamp, integer, numeric, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  pairId: integer("pair_id").notNull(),
  side: text("side").notNull(),
  type: text("type").notNull().default("limit"),
  price: numeric("price", { precision: 28, scale: 8 }).notNull().default("0"),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  filledQty: numeric("filled_qty", { precision: 28, scale: 8 }).notNull().default("0"),
  avgPrice: numeric("avg_price", { precision: 28, scale: 8 }).notNull().default("0"),
  fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
  tds: numeric("tds", { precision: 28, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("open"),
  isBot: integer("is_bot").notNull().default(0),
  botId: integer("bot_id"),
  stopPrice: numeric("stop_price", { precision: 28, scale: 8 }),
  // OCO (One-Cancels-Other) bracket orders: SL + PL share the same ocoGroupId.
  // When either fills or is cancelled, the engine cancels the other automatically.
  ocoGroupId: text("oco_group_id"),
  // noLock=1: order was placed without locking balance (used for SL bracket leg
  // which shares the locked balance with the PL leg via the OCO mechanism).
  noLock: integer("no_lock").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  userIdx:       index("orders_user_id_idx").on(t.userId),
  pairIdx:       index("orders_pair_id_idx").on(t.pairId),
  statusIdx:     index("orders_status_idx").on(t.status),
  userStatusIdx: index("orders_user_status_idx").on(t.userId, t.status),
  pairStatusIdx: index("orders_pair_status_idx").on(t.pairId, t.status),
  ocoGroupIdx:   index("orders_oco_group_id_idx").on(t.ocoGroupId),
}));

export type Order = typeof ordersTable.$inferSelect;

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  orderId: integer("order_id").notNull(),
  userId: integer("user_id").notNull(),
  pairId: integer("pair_id").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
  // 1 % TDS (or whatever rate the admin sets in `tds.percent`) deducted on
  // the seller's quote proceeds for this fill. Always 0 on the buy-side row.
  tds: numeric("tds", { precision: 28, scale: 8 }).notNull().default("0"),
  // true = this row is the aggressive (taker) side of the match;
  // false = resting (maker) side. Each matched trade produces exactly two rows —
  // one taker + one maker — so filtering isTaker=true gives exactly 1 row per
  // match for the trade tape / admin history without any duplicates.
  isTaker: integer("is_taker").notNull().default(0),
  // The opposing order's id — for taker rows this is the maker's orderId and
  // vice-versa. Lets the UI/admin reconstruct the full match without a JOIN.
  counterOrderId: integer("counter_order_id"),
  // GST % and TDS % snapshotted at fill-time so invoices are accurate even
  // if the admin later changes the global rate settings.
  gstPct: numeric("gst_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  tdsPct: numeric("tds_pct", { precision: 8, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx:         index("trades_user_id_idx").on(t.userId),
  pairIdx:         index("trades_pair_id_idx").on(t.pairId),
  orderIdx:        index("trades_order_id_idx").on(t.orderId),
  counterOrderIdx: index("trades_counter_order_id_idx").on(t.counterOrderId),
  createdAtIdx:    index("trades_created_at_idx").on(t.createdAt),
  // Composite index for OHLCV chart queries (pair_id range + created_at range)
  pairCreatedIdx:  index("trades_pair_created_idx").on(t.pairId, t.createdAt),
}));

export type Trade = typeof tradesTable.$inferSelect;
