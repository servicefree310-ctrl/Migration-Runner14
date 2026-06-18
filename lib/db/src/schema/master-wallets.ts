import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const masterWalletsTable = pgTable("master_wallets", {
  id:             serial("id").primaryKey(),
  coin:           text("coin").notNull(),
  network:        text("network").notNull(),
  label:          text("label").notNull(),
  depositAddress: text("deposit_address"),
  xpubKey:        text("xpub_key"),
  notes:          text("notes"),
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export type MasterWallet = typeof masterWalletsTable.$inferSelect;
