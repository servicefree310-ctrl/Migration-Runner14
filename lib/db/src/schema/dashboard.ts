import { pgTable, serial, integer, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

// Customizable Pro Dashboard layouts (per-user, named layouts)
export const dashboardLayoutsTable = pgTable("dashboard_layouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull().default("Default"),
  isDefault: integer("is_default").notNull().default(0),
  layout: jsonb("layout").$type<Array<{ id: string; type: string; x: number; y: number; w: number; h: number; config?: Record<string, unknown> }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserName: uniqueIndex("dashboard_layouts_user_name_idx").on(t.userId, t.name),
}));
export type DashboardLayout = typeof dashboardLayoutsTable.$inferSelect;

// Watchlists for Pro Dashboard widgets
export const watchlistsTable = pgTable("watchlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull().default("My Watchlist"),
  symbols: jsonb("symbols").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserName: uniqueIndex("watchlists_user_name_idx").on(t.userId, t.name),
}));
export type Watchlist = typeof watchlistsTable.$inferSelect;
