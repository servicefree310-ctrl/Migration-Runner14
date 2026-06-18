import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("user"),
  kycLevel: integer("kyc_level").notNull().default(0),
  vipTier: integer("vip_tier").notNull().default(0),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: integer("referred_by"),
  status: text("status").notNull().default("active"),
  twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
  // Per-user opt-in for an extra OTP factor at login (in addition to admin
  // global enforcement). Effective requirement = admin_setting OR user_pref.
  loginEmailOtpEnabled: boolean("login_email_otp_enabled").notNull().default(false),
  loginPhoneOtpEnabled: boolean("login_phone_otp_enabled").notNull().default(false),
  uid: text("uid").notNull().unique(),
  avatarUrl: text("avatar_url"),
  emailVerified: boolean("email_verified").notNull().default(false),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  withdrawLockUntil: timestamp("withdraw_lock_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
