import { pgTable, serial, text, numeric, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const activityTypeEnum = pgEnum("activity_type", [
  "new_user", "kyc_submitted", "kyc_approved", "kyc_rejected",
  "large_withdrawal", "large_trade", "pair_added", "user_suspended",
  "balance_adjust", "2fa_enabled", "2fa_disabled", "backup_code_used",
  "email_verified", "phone_verified", "password_reset", "settings_changed",
  "withdrawal_approved", "withdrawal_rejected",
]);

export const activityEventsTable = pgTable("activity_events", {
  id:          serial("id").primaryKey(),
  type:        activityTypeEnum("type").notNull(),
  description: text("description").notNull(),
  userId:      integer("user_id"),
  username:    text("username"),
  amount:      numeric("amount", { precision: 20, scale: 8 }),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type ActivityEvent = typeof activityEventsTable.$inferSelect;
