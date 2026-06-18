import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const walletAddressesTable = pgTable("wallet_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  networkId: integer("network_id").notNull(),
  address: text("address").notNull(),
  memo: text("memo"),
  privateKeyEnc: text("private_key_enc"),
  derivationPath: text("derivation_path"),
  derivationIndex: integer("derivation_index"),
  status: text("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wallet_addresses_user_network_uniq").on(t.userId, t.networkId),
}));

export type WalletAddress = typeof walletAddressesTable.$inferSelect;
