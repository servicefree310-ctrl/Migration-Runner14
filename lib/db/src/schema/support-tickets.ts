import { pgTable, serial, integer, text, timestamp, boolean, pgEnum, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { usersTable } from "./users";

export const ticketStatusEnum   = pgEnum("ticket_status",   ["open", "in_progress", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const ticketCategoryEnum = pgEnum("ticket_category", ["general", "kyc", "deposit", "withdrawal", "trading", "technical", "account"]);
export const msgSenderTypeEnum  = pgEnum("msg_sender_type", ["user", "admin", "bot"]);

export const supportTicketsTable = pgTable("support_tickets", {
  id:            serial("id").primaryKey(),
  uid:           varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId:        integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subject:       text("subject").notNull(),
  status:        ticketStatusEnum("status").notNull().default("open"),
  priority:      ticketPriorityEnum("priority").notNull().default("normal"),
  category:      ticketCategoryEnum("category").notNull().default("general"),
  agentId:       integer("agent_id").references(() => usersTable.id),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
  resolvedAt:    timestamp("resolved_at"),
});

export const ticketMessagesTable = pgTable("ticket_messages", {
  id:         serial("id").primaryKey(),
  ticketId:   integer("ticket_id").notNull().references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  senderId:   integer("sender_id").references(() => usersTable.id),
  senderType: msgSenderTypeEnum("sender_type").notNull().default("user"),
  message:    text("message").notNull(),
  isRead:     boolean("is_read").notNull().default(false),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export type SupportTicket   = typeof supportTicketsTable.$inferSelect;
export type TicketMessage   = typeof ticketMessagesTable.$inferSelect;
