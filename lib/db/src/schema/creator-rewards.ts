import {
  pgTable, text, serial, timestamp, integer, numeric, boolean, index, varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const creatorSubmissionsTable = pgTable("creator_submissions", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform:    varchar("platform", { length: 32 }).notNull(),
  videoUrl:    text("video_url").notNull(),
  title:       text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  screenshotUrl: text("screenshot_url"),
  views:       integer("views").notNull().default(0),
  status:      text("status").notNull().default("pending"),
  reviewNote:  text("review_note"),
  baseReward:  numeric("base_reward", { precision: 18, scale: 4 }).notNull().default("0"),
  bonusPaid:   numeric("bonus_paid",  { precision: 18, scale: 4 }).notNull().default("0"),
  rewardPaid:  boolean("reward_paid").notNull().default(false),
  reviewedBy:  integer("reviewed_by"),
  reviewedAt:  timestamp("reviewed_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byUser:   index("creator_submissions_user_idx").on(t.userId),
  byStatus: index("creator_submissions_status_idx").on(t.status),
}));

export type CreatorSubmission = typeof creatorSubmissionsTable.$inferSelect;

export const creatorRewardSettingsTable = pgTable("creator_reward_settings", {
  id:               serial("id").primaryKey(),
  programEnabled:   boolean("program_enabled").notNull().default(true),
  baseRewardUsdt:   numeric("base_reward_usdt", { precision: 18, scale: 4 }).notNull().default("10"),
  referralRewardUsdt: numeric("referral_reward_usdt", { precision: 18, scale: 4 }).notNull().default("15"),
  bonus1kUsdt:      numeric("bonus_1k_usdt",   { precision: 18, scale: 4 }).notNull().default("1"),
  bonus100kUsdt:    numeric("bonus_100k_usdt", { precision: 18, scale: 4 }).notNull().default("100"),
  bonus1mUsdt:      numeric("bonus_1m_usdt",   { precision: 18, scale: 4 }).notNull().default("1000"),
  minVideoDurationSec: integer("min_video_duration_sec").notNull().default(15),
  maxSubmissionsPerUser: integer("max_submissions_per_user").notNull().default(10),
  autoApprove:      boolean("auto_approve").notNull().default(false),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CreatorRewardSettings = typeof creatorRewardSettingsTable.$inferSelect;
