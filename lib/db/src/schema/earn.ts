import { pgTable, text, serial, timestamp, integer, numeric, boolean, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

export const earnProductsTable = pgTable("earn_products", {
  id: serial("id").primaryKey(),
  coinId: integer("coin_id").notNull(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  type: text("type").notNull(),
  durationDays: integer("duration_days").notNull().default(0),
  apy: numeric("apy", { precision: 6, scale: 2 }).notNull(),
  minAmount: numeric("min_amount", { precision: 28, scale: 8 }).notNull().default("0"),
  maxAmount: numeric("max_amount", { precision: 28, scale: 8 }).notNull().default("0"),
  totalCap: numeric("total_cap", { precision: 28, scale: 8 }).notNull().default("0"),
  currentSubscribed: numeric("current_subscribed", { precision: 28, scale: 8 }).notNull().default("0"),
  payoutInterval: text("payout_interval").notNull().default("daily"),
  compounding: boolean("compounding").notNull().default(false),
  earlyRedemption: boolean("early_redemption").notNull().default(false),
  earlyRedemptionPenaltyPct: numeric("early_redemption_penalty_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  minVipTier: integer("min_vip_tier").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  saleStartAt: timestamp("sale_start_at", { withTimezone: true }),
  saleEndAt: timestamp("sale_end_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EarnProduct = typeof earnProductsTable.$inferSelect;

export const earnPositionsTable = pgTable("earn_positions", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
  totalEarned: numeric("total_earned", { precision: 28, scale: 8 }).notNull().default("0"),
  autoMaturity: boolean("auto_maturity").notNull().default(false),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  maturedAt: timestamp("matured_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => ({
  byUser:    index("earn_positions_user_idx").on(t.userId),
  byProduct: index("earn_positions_product_idx").on(t.productId),
}));

export type EarnPosition = typeof earnPositionsTable.$inferSelect;
