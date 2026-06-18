import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

export const inrDepositsTable = pgTable("inr_deposits", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  gatewayId: integer("gateway_id").notNull(),
  bankId: integer("bank_id"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 2 }).notNull().default("0"),
  refId: text("ref_id").notNull().unique(),
  utr: text("utr"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  reviewedBy: integer("reviewed_by"),
  gatewayOrderId: text("gateway_order_id"),
  gatewayPaymentId: text("gateway_payment_id"),
  gatewayMethod: text("gateway_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => ({
  byUser:   index("inr_deposits_user_idx").on(t.userId),
  byStatus: index("inr_deposits_status_idx").on(t.status),
}));

export type InrDeposit = typeof inrDepositsTable.$inferSelect;

export const inrWithdrawalsTable = pgTable("inr_withdrawals", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  bankId: integer("bank_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 2 }).notNull().default("0"),
  refId: text("ref_id").notNull().unique(),
  status: text("status").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  reviewedBy: integer("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => ({
  byUser:   index("inr_withdrawals_user_idx").on(t.userId),
  byStatus: index("inr_withdrawals_status_idx").on(t.status),
}));

export type InrWithdrawal = typeof inrWithdrawalsTable.$inferSelect;

export const cryptoDepositsTable = pgTable("crypto_deposits", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  coinId: integer("coin_id").notNull(),
  networkId: integer("network_id").notNull(),
  amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
  address: text("address").notNull(),
  fromAddress: text("from_address"),
  txHash: text("tx_hash"),
  blockNumber: integer("block_number"),
  logIndex: integer("log_index"),
  confirmations: integer("confirmations").notNull().default(0),
  requiredConfirmations: integer("required_confirmations").notNull().default(12),
  status: text("status").notNull().default("pending"),
  detectedBy: text("detected_by").notNull().default("manual"),
  sweepStatus: text("sweep_status"),
  sweepTxHash: text("sweep_tx_hash"),
  sweptAt: timestamp("swept_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => ({
  uniqTx: uniqueIndex("crypto_deposits_tx_log_uniq").on(t.networkId, t.txHash, t.logIndex),
}));

export type CryptoDeposit = typeof cryptoDepositsTable.$inferSelect;

export const cryptoWithdrawalsTable = pgTable("crypto_withdrawals", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  coinId: integer("coin_id").notNull(),
  networkId: integer("network_id").notNull(),
  amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
  fee: numeric("fee", { precision: 28, scale: 8 }).notNull().default("0"),
  toAddress: text("to_address").notNull(),
  memo: text("memo"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  reviewedBy: integer("reviewed_by"),
  confirmations: integer("confirmations").notNull().default(0),
  broadcastedAt: timestamp("broadcasted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => ({
  byUser:   index("crypto_withdrawals_user_idx").on(t.userId),
  byStatus: index("crypto_withdrawals_status_idx").on(t.status),
}));

export type CryptoWithdrawal = typeof cryptoWithdrawalsTable.$inferSelect;

export const withdrawalWhitelistTable = pgTable("withdrawal_whitelist", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  coinId: integer("coin_id"),
  networkId: integer("network_id"),
  address: text("address").notNull(),
  memo: text("memo"),
  label: text("label").notNull().default(""),
  unlocksAt: timestamp("unlocks_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("withdrawal_whitelist_user_idx").on(t.userId),
  byUserAddr: uniqueIndex("withdrawal_whitelist_user_addr_net_idx").on(t.userId, t.address, t.networkId),
}));

export type WithdrawalWhitelist = typeof withdrawalWhitelistTable.$inferSelect;

export const transfersTable = pgTable("transfers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fromWallet: text("from_wallet").notNull(),
  toWallet: text("to_wallet").notNull(),
  coinId: integer("coin_id").notNull(),
  amount: numeric("amount", { precision: 28, scale: 8 }).notNull(),
  toUserId: integer("to_user_id"),
  note: text("note"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("transfers_user_idx").on(t.userId),
}));

export type Transfer = typeof transfersTable.$inferSelect;
