import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const depositAddressesTable = pgTable("deposit_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  coinId: integer("coin_id").notNull(),
  networkId: integer("network_id").notNull(),
  address: text("address").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("deposit_addresses_uniq").on(t.userId, t.coinId, t.networkId),
}));

export type DepositAddress = typeof depositAddressesTable.$inferSelect;
