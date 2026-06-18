import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const fundingRatesTable = pgTable("funding_rates", {
  id: serial("id").primaryKey(),
  pairId: integer("pair_id").notNull(),
  rate: numeric("rate", { precision: 10, scale: 6 }).notNull().default("0"),
  intervalHours: integer("interval_hours").notNull().default(8),
  fundingTime: timestamp("funding_time", { withTimezone: true }).notNull(),
  source: text("source").notNull().default("auto"),
  settled: text("settled").notNull().default("false"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  positionsAffected: integer("positions_affected").notNull().default(0),
  totalPaid: numeric("total_paid", { precision: 28, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FundingRate = typeof fundingRatesTable.$inferSelect;

export const adminApiKeysTable = pgTable("admin_api_keys", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  label: text("label").notNull().default(""),
  apiKey: text("api_key").notNull().default(""),
  apiSecret: text("api_secret").notNull().default(""),
  baseUrl: text("base_url"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AdminApiKey = typeof adminApiKeysTable.$inferSelect;
