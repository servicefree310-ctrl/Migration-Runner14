import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";

export const gatewaysTable = pgTable("gateways", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  direction: text("direction").notNull(),
  provider: text("provider").notNull().default("manual"),
  currency: text("currency").notNull().default("INR"),
  minAmount: numeric("min_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  feeFlat: numeric("fee_flat", { precision: 18, scale: 2 }).notNull().default("0"),
  feePercent: numeric("fee_percent", { precision: 6, scale: 4 }).notNull().default("0"),
  processingTime: text("processing_time").notNull().default("Instant"),
  isAuto: boolean("is_auto").notNull().default(false),
  status: text("status").notNull().default("active"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  webhookSecret: text("webhook_secret"),
  testMode: boolean("test_mode").notNull().default(true),
  logoUrl: text("logo_url"),
  config: text("config").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Gateway = typeof gatewaysTable.$inferSelect;

export const otpProvidersTable = pgTable("otp_providers", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  provider: text("provider").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  senderId: text("sender_id"),
  template: text("template"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OtpProvider = typeof otpProvidersTable.$inferSelect;

export const emailConfigsTable = pgTable("email_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("smtp"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpSecure: boolean("smtp_secure").default(false),
  username: text("username"),
  password: text("password"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  apiKey: text("api_key"),
  domain: text("domain"),
  region: text("region").default("us-east-1"),
  isActive: boolean("is_active").notNull().default(false),
  testStatus: text("test_status").notNull().default("untested"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type EmailConfig = typeof emailConfigsTable.$inferSelect;

export const customApisTable = pgTable("custom_apis", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("webhook"),
  endpointUrl: text("endpoint_url").notNull(),
  method: text("method").notNull().default("POST"),
  authType: text("auth_type").notNull().default("none"),
  authValue: text("auth_value"),
  headers: text("headers").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(false),
  lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
  lastStatus: text("last_status").default("untested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CustomApi = typeof customApisTable.$inferSelect;
