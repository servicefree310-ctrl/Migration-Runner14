import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const exchangeSettingsTable = pgTable("exchange_settings", {
  key:       varchar("key", { length: 100 }).primaryKey(),
  value:     text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ExchangeSetting = typeof exchangeSettingsTable.$inferSelect;
