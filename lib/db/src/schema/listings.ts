import { pgTable, serial, integer, text, timestamp, numeric, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { coinsTable } from "./coins";
import { web3TokensTable, web3NetworksTable } from "./web3";

export const listingRulesTable = pgTable("listing_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("manual"),
  scope: text("scope").notNull().default("both"),
  minVolume24hUsd: numeric("min_volume_24h_usd", { precision: 24, scale: 2 }).notNull().default("100000"),
  minMarketCapUsd: numeric("min_market_cap_usd", { precision: 24, scale: 2 }).notNull().default("1000000"),
  minLiquidityUsd: numeric("min_liquidity_usd", { precision: 24, scale: 2 }).notNull().default("50000"),
  minAgeDays: integer("min_age_days").notNull().default(7),
  chainsAllowed: jsonb("chains_allowed").$type<string[]>().notNull().default([]),
  sourceFilter: jsonb("source_filter").$type<string[]>().notNull().default([]),
  autoCreatePair: boolean("auto_create_pair").notNull().default(true),
  quoteSymbol: text("quote_symbol").notNull().default("USDT"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  byActivePriority: index("listing_rules_active_priority_idx").on(t.isActive, t.priority),
}));

export const listingSourcesTable = pgTable("listing_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  endpoint: text("endpoint"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  syncIntervalMin: integer("sync_interval_min").notNull().default(15),
  maxItemsPerSync: integer("max_items_per_sync").notNull().default(50),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncCount: integer("last_sync_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqKindName: uniqueIndex("listing_sources_uniq_idx").on(t.kind, t.name),
}));

export const listingCandidatesTable = pgTable("listing_candidates", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  sourceRef: text("source_ref").notNull(),
  chain: text("chain"),
  contractAddress: text("contract_address"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  priceUsd: numeric("price_usd", { precision: 24, scale: 8 }).notNull().default("0"),
  marketCapUsd: numeric("market_cap_usd", { precision: 24, scale: 2 }).notNull().default("0"),
  volume24hUsd: numeric("volume_24h_usd", { precision: 24, scale: 2 }).notNull().default("0"),
  liquidityUsd: numeric("liquidity_usd", { precision: 24, scale: 2 }).notNull().default("0"),
  priceChange24h: numeric("price_change_24h", { precision: 12, scale: 4 }).notNull().default("0"),
  ageDays: integer("age_days").notNull().default(0),
  riskScore: integer("risk_score").notNull().default(50),
  riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
  rawData: jsonb("raw_data"),
  status: text("status").notNull().default("pending"),
  ruleId: integer("rule_id").references(() => listingRulesTable.id),
  decidedBy: integer("decided_by").references(() => usersTable.id),
  decidedAt: timestamp("decided_at"),
  decisionNote: text("decision_note"),
  listedCoinId: integer("listed_coin_id").references(() => coinsTable.id),
  listedTokenId: integer("listed_token_id").references(() => web3TokensTable.id),
  listedNetworkId: integer("listed_network_id").references(() => web3NetworksTable.id),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uniqSourceRef: uniqueIndex("listing_candidates_uniq_idx").on(t.source, t.sourceRef),
  byStatusDiscovered: index("listing_candidates_status_idx").on(t.status, t.discoveredAt),
  bySymbol: index("listing_candidates_symbol_idx").on(t.symbol),
}));
