import { pgTable, serial, integer, text, numeric, timestamp, pgEnum, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { usersTable } from "./users";
import { coinsTable } from "./coins";

export const ledgerTypeEnum = pgEnum("ledger_type", [
  "deposit_inr",
  "deposit_crypto",
  "withdrawal_inr",
  "withdrawal_crypto",
  "ai_earning",
  "ai_principal_lock",
  "ai_principal_return",
  "transfer_in",
  "transfer_out",
  "trade_fee",
  "trade_tds",
  "trade_buy",
  "trade_sell",
  "earn_deposit",
  "earn_withdrawal",
  "earn_interest",
  "p2p_credit",
  "p2p_debit",
  "referral_bonus",
  "video_reward",
  "admin_credit",
  "admin_debit",
  "convert",
  "options_pnl",
  "futures_pnl",
  "instruments_margin",
  "instruments_pnl",
]);

export const walletLedgerTable = pgTable("wallet_ledger", {
  id:            serial("id").primaryKey(),
  uid:           varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId:        integer("user_id").notNull().references(() => usersTable.id),
  coinId:        integer("coin_id").notNull().references(() => coinsTable.id),
  walletType:    text("wallet_type").notNull().default("spot"),
  type:          ledgerTypeEnum("type").notNull(),
  amount:        numeric("amount", { precision: 28, scale: 8 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 28, scale: 8 }).notNull().default("0"),
  balanceAfter:  numeric("balance_after",  { precision: 28, scale: 8 }).notNull().default("0"),
  refType:       text("ref_type"),
  refId:         text("ref_id"),
  note:          text("note"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx:    index("wallet_ledger_user_idx").on(t.userId),
  coinIdx:    index("wallet_ledger_coin_idx").on(t.coinId),
  typeIdx:    index("wallet_ledger_type_idx").on(t.type),
  createdIdx: index("wallet_ledger_created_idx").on(t.createdAt),
}));

export type WalletLedgerEntry = typeof walletLedgerTable.$inferSelect;
export type NewWalletLedgerEntry = typeof walletLedgerTable.$inferInsert;
