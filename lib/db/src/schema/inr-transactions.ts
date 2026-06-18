import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const inrTxTypeEnum   = pgEnum("inr_tx_type",   ["deposit", "withdrawal"]);
export const inrTxStatusEnum = pgEnum("inr_tx_status",  ["pending", "processing", "completed", "failed", "rejected"]);
export const inrMethodEnum   = pgEnum("inr_method",     ["upi", "bank_transfer", "neft", "rtgs", "imps"]);

export const inrTransactionsTable = pgTable("inr_transactions", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id),
  type:            inrTxTypeEnum("type").notNull(),
  amountInr:       numeric("amount_inr",  { precision: 20, scale: 2 }).notNull(),
  usdAmount:       numeric("usd_amount",  { precision: 20, scale: 8 }),
  method:          inrMethodEnum("method").notNull(),
  upiId:           text("upi_id"),
  bankName:        text("bank_name"),
  accountNumber:   text("account_number"),
  ifscCode:        text("ifsc_code"),
  accountHolder:   text("account_holder"),
  utrNumber:       text("utr_number"),
  referenceNumber: text("reference_number"),
  status:          inrTxStatusEnum("status").notNull().default("pending"),
  adminNote:       text("admin_note"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export type INRTransaction = typeof inrTransactionsTable.$inferSelect;
