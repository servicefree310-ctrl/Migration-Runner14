import { pgTable, serial, numeric, timestamp } from "drizzle-orm/pg-core";

export const feeConfigTable = pgTable("fee_config", {
  id:                   serial("id").primaryKey(),
  defaultMakerFee:      numeric("default_maker_fee",      { precision: 10, scale: 6 }).notNull().default("0.001"),
  defaultTakerFee:      numeric("default_taker_fee",      { precision: 10, scale: 6 }).notNull().default("0.001"),
  withdrawalFeePercent: numeric("withdrawal_fee_percent", { precision: 10, scale: 6 }).notNull().default("0.001"),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
});

export type FeeConfig = typeof feeConfigTable.$inferSelect;
