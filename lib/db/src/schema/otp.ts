import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";

export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  channel: text("channel").notNull(),
  purpose: text("purpose").notNull(),
  recipient: text("recipient").notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byRecipientPurpose: index("otp_codes_recipient_purpose_idx").on(t.recipient, t.purpose),
}));

export type OtpCode = typeof otpCodesTable.$inferSelect;
