import { pgTable, text, serial, timestamp, integer, numeric, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

/**
 * Instant-convert quotes. A row is created on POST /convert/quote with
 * status='pending' and expires_at = now() + 10s. POST /convert/execute
 * atomically validates the row, debits/credits wallets, and flips status
 * to 'executed' (or 'expired' if the lock has elapsed).
 *
 * Idempotency: the row's status is the source of truth. Two concurrent
 * /execute calls with the same quoteId race for SELECT … FOR UPDATE; the
 * second sees status='executed' and is rejected with 409.
 */
export const convertQuotesTable = pgTable("convert_quotes", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique()
    .$defaultFn(() => ulid())
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  fromCoinId: integer("from_coin_id").notNull(),
  toCoinId: integer("to_coin_id").notNull(),
  fromAmount: numeric("from_amount", { precision: 28, scale: 8 }).notNull(),
  toAmount: numeric("to_amount", { precision: 28, scale: 8 }).notNull(),
  rate: numeric("rate", { precision: 28, scale: 8 }).notNull(),
  feeAmount: numeric("fee_amount", { precision: 28, scale: 8 }).notNull().default("0"),
  feeBps: integer("fee_bps").notNull().default(0),
  vipTier: integer("vip_tier").notNull().default(0),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserStatus: index("convert_quotes_user_status_idx").on(t.userId, t.status),
}));

export type ConvertQuote = typeof convertQuotesTable.$inferSelect;
