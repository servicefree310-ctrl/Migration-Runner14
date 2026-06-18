import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  walletType: text("wallet_type").notNull(),
  coinId: integer("coin_id").notNull(),
  balance: numeric("balance", { precision: 28, scale: 8 }).notNull().default("0"),
  // General locked balance (futures escrow, withdrawal pending, etc.)
  locked: numeric("locked", { precision: 28, scale: 8 }).notNull().default("0"),
  // P2P-specific escrow lock — kept separate from general `locked` so
  // P2P engine can detect and refund stuck escrow without conflating
  // it with futures margin / withdrawal holds. Maintained transactionally
  // by lib/p2p-escrow.ts (lock/release/refund helpers).
  p2pLocked: numeric("p2p_locked", { precision: 28, scale: 8 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniq: uniqueIndex("wallets_user_type_coin_idx").on(t.userId, t.walletType, t.coinId),
}));

export type Wallet = typeof walletsTable.$inferSelect;

export const cryptoAddressesTable = pgTable("crypto_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  coinId: integer("coin_id").notNull(),
  networkId: integer("network_id").notNull(),
  address: text("address").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CryptoAddress = typeof cryptoAddressesTable.$inferSelect;
