import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";

export const brokerConfigTable = pgTable("broker_config", {
  id: serial("id").primaryKey(),
  broker: text("broker").notNull().default("angelone"),
  apiKey: text("api_key"),
  clientId: text("client_id"),
  totpSecret: text("totp_secret"),
  apiSecretEnc: text("api_secret_enc"),
  jwtToken: text("jwt_token"),
  jwtExpiresAt: timestamp("jwt_expires_at", { withTimezone: true }),
  refreshToken: text("refresh_token"),
  feedToken: text("feed_token"),
  enabled: boolean("enabled").notNull().default(false),
  sandboxMode: boolean("sandbox_mode").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BrokerConfig = typeof brokerConfigTable.$inferSelect;

export const instrumentsTable = pgTable("instruments", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(),
  exchange: text("exchange").notNull().default("NSE"),
  brokerSymbol: text("broker_symbol"),
  brokerToken: text("broker_token"),
  lotSize: numeric("lot_size", { precision: 18, scale: 4 }).notNull().default("1"),
  tickSize: numeric("tick_size", { precision: 18, scale: 8 }).notNull().default("0.01"),
  pricePrecision: integer("price_precision").notNull().default(2),
  qtyPrecision: integer("qty_precision").notNull().default(4),
  minQty: numeric("min_qty", { precision: 18, scale: 4 }).notNull().default("1"),
  maxQty: numeric("max_qty", { precision: 18, scale: 4 }).notNull().default("10000"),
  marginRequired: numeric("margin_required", { precision: 8, scale: 4 }).notNull().default("0.10"),
  maxLeverage: integer("max_leverage").notNull().default(10),
  takerFee: numeric("taker_fee", { precision: 8, scale: 6 }).notNull().default("0.0003"),
  makerFee: numeric("maker_fee", { precision: 8, scale: 6 }).notNull().default("0.0002"),
  quoteCurrency: text("quote_currency").notNull().default("INR"),
  currentPrice: numeric("current_price", { precision: 24, scale: 8 }).notNull().default("0"),
  previousClose: numeric("previous_close", { precision: 24, scale: 8 }).notNull().default("0"),
  change24h: numeric("change_24h", { precision: 10, scale: 4 }).notNull().default("0"),
  high24h: numeric("high_24h", { precision: 24, scale: 8 }).notNull().default("0"),
  low24h: numeric("low_24h", { precision: 24, scale: 8 }).notNull().default("0"),
  volume24h: numeric("volume_24h", { precision: 28, scale: 4 }).notNull().default("0"),
  tradingEnabled: boolean("trading_enabled").notNull().default(true),
  description: text("description"),
  logoUrl: text("logo_url"),
  sector: text("sector"),
  isin: text("isin"),
  countryCode: text("country_code").notNull().default("IN"),
  priceSource: text("price_source").notNull().default("broker"),
  manualPrice: numeric("manual_price", { precision: 24, scale: 8 }),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Instrument = typeof instrumentsTable.$inferSelect;

export const instrumentOrdersTable = pgTable("instrument_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  instrumentId: integer("instrument_id").notNull(),
  side: text("side").notNull(),
  type: text("type").notNull().default("market"),
  qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
  price: numeric("price", { precision: 24, scale: 8 }),
  stopPrice: numeric("stop_price", { precision: 24, scale: 8 }),
  filledQty: numeric("filled_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  avgFillPrice: numeric("avg_fill_price", { precision: 24, scale: 8 }),
  status: text("status").notNull().default("pending"),
  brokerOrderId: text("broker_order_id"),
  brokerStatus: text("broker_status"),
  leverage: integer("leverage").notNull().default(1),
  marginUsed: numeric("margin_used", { precision: 24, scale: 8 }).notNull().default("0"),
  fee: numeric("fee", { precision: 24, scale: 8 }).notNull().default("0"),
  pnl: numeric("pnl", { precision: 24, scale: 8 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InstrumentOrder = typeof instrumentOrdersTable.$inferSelect;

export const instrumentPositionsTable = pgTable("instrument_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  instrumentId: integer("instrument_id").notNull(),
  side: text("side").notNull(),
  qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
  avgEntryPrice: numeric("avg_entry_price", { precision: 24, scale: 8 }).notNull(),
  currentPrice: numeric("current_price", { precision: 24, scale: 8 }).notNull().default("0"),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 24, scale: 8 }).notNull().default("0"),
  realizedPnl: numeric("realized_pnl", { precision: 24, scale: 8 }).notNull().default("0"),
  marginUsed: numeric("margin_used", { precision: 24, scale: 8 }).notNull().default("0"),
  leverage: integer("leverage").notNull().default(1),
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InstrumentPosition = typeof instrumentPositionsTable.$inferSelect;
