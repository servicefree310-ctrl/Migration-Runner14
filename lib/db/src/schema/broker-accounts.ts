import { pgTable, serial, integer, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const brokerAccountsTable = pgTable("broker_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Angel One account details
  angelClientId: text("angel_client_id"),          // Angel One client ID after account creation
  angelDemat: text("angel_demat"),                 // DP / demat account number
  angelTradingId: text("angel_trading_id"),        // Trading account ID
  // Application status
  status: text("status").notNull().default("draft"), // draft | submitted | under_review | approved | rejected | active
  rejectionReason: text("rejection_reason"),
  // Personal details
  fullName: text("full_name"),
  dob: text("dob"),                                // YYYY-MM-DD
  gender: text("gender"),                          // male | female | other
  fatherName: text("father_name"),
  motherName: text("mother_name"),
  maritalStatus: text("marital_status"),
  annualIncome: text("annual_income"),
  occupation: text("occupation"),
  // Contact
  mobile: text("mobile"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  // Identity
  panNumber: text("pan_number"),
  aadharNumber: text("aadhar_number"),
  // Bank details
  bankAccountNo: text("bank_account_no"),
  bankIfsc: text("bank_ifsc"),
  bankName: text("bank_name"),
  bankAccountType: text("bank_account_type"),     // savings | current
  // Trading preferences
  segmentEquity: boolean("segment_equity").default(true),
  segmentFno: boolean("segment_fno").default(false),
  segmentCommodity: boolean("segment_commodity").default(false),
  segmentCurrency: boolean("segment_currency").default(false),
  // Nominee
  nomineeName: text("nominee_name"),
  nomineeRelation: text("nominee_relation"),
  nomineeDob: text("nominee_dob"),
  // Angel One API tokens (after account activation)
  jwtToken: text("jwt_token"),
  jwtExpiresAt: timestamp("jwt_expires_at"),
  refreshToken: text("refresh_token"),
  feedToken: text("feed_token"),
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const brokerKycDocsTable = pgTable("broker_kyc_docs", {
  id: serial("id").primaryKey(),
  brokerAccountId: integer("broker_account_id").notNull().references(() => brokerAccountsTable.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(), // pan_card | aadhar_front | aadhar_back | photo | signature | bank_proof | income_proof | cancelled_cheque
  fileUrl: text("file_url"),           // stored URL
  fileKey: text("file_key"),           // storage key
  status: text("status").notNull().default("pending"), // pending | verified | rejected
  rejectionNote: text("rejection_note"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  verifiedAt: timestamp("verified_at"),
});

export const brokerOrdersTable = pgTable("broker_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  brokerAccountId: integer("broker_account_id").references(() => brokerAccountsTable.id),
  // Instrument
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  assetClass: text("asset_class").notNull(),        // forex | stock | commodity
  // Order details
  orderType: text("order_type").notNull(),          // market | limit | sl | sl-m
  side: text("side").notNull(),                      // buy | sell
  qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
  price: numeric("price", { precision: 18, scale: 6 }),
  triggerPrice: numeric("trigger_price", { precision: 18, scale: 6 }),
  // Execution
  status: text("status").notNull().default("pending"), // pending | open | complete | cancelled | rejected
  angelOrderId: text("angel_order_id"),
  executedQty: numeric("executed_qty", { precision: 18, scale: 4 }).default("0"),
  executedPrice: numeric("executed_price", { precision: 18, scale: 6 }),
  pnl: numeric("pnl", { precision: 18, scale: 6 }),
  brokerage: numeric("brokerage", { precision: 18, scale: 6 }),
  // Meta
  simulated: boolean("simulated").notNull().default(true),
  errorMsg: text("error_msg"),
  placedAt: timestamp("placed_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const brokerPortfolioTable = pgTable("broker_portfolio", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  brokerAccountId: integer("broker_account_id").references(() => brokerAccountsTable.id),
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  assetClass: text("asset_class").notNull(),
  holdingQty: numeric("holding_qty", { precision: 18, scale: 4 }).notNull().default("0"),
  avgBuyPrice: numeric("avg_buy_price", { precision: 18, scale: 6 }).notNull().default("0"),
  currentPrice: numeric("current_price", { precision: 18, scale: 6 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 18, scale: 6 }),
  realizedPnl: numeric("realized_pnl", { precision: 18, scale: 6 }).default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── MT5 Accounts ─────────────────────────────────────────────────────────────
export const mt5AccountsTable = pgTable("mt5_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Connection details
  server: text("server").notNull(),                   // e.g. "ICMarkets-Demo", "Pepperstone-MT5"
  login: text("login").notNull(),                     // MT5 account number
  passwordHash: text("password_hash"),                // bcrypt hash of investor/master password
  // Account info (from MT5 terminal on connect)
  name: text("name"),                                 // account holder name
  currency: text("currency").default("USD"),
  leverage: integer("leverage"),
  balance: numeric("balance", { precision: 18, scale: 2 }).default("0"),
  equity: numeric("equity", { precision: 18, scale: 2 }).default("0"),
  margin: numeric("margin", { precision: 18, scale: 2 }).default("0"),
  freeMargin: numeric("free_margin", { precision: 18, scale: 2 }).default("0"),
  // Status
  status: text("status").notNull().default("disconnected"), // connected | disconnected | error
  isDemo: boolean("is_demo").notNull().default(true),
  connectionType: text("connection_type").default("investor"), // investor | master
  lastError: text("last_error"),
  lastConnectedAt: timestamp("last_connected_at"),
  // Session token (MT5 HTTP bridge session)
  sessionToken: text("session_token"),
  sessionExpiresAt: timestamp("session_expires_at"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── MT5 Orders (for audit trail) ────────────────────────────────────────────
export const mt5OrdersTable = pgTable("mt5_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  mt5AccountId: integer("mt5_account_id").references(() => mt5AccountsTable.id),
  symbol: text("symbol").notNull(),
  orderType: text("order_type").notNull(),            // market | limit | stop | stop_limit
  side: text("side").notNull(),                       // buy | sell
  volume: numeric("volume", { precision: 18, scale: 4 }).notNull(),
  openPrice: numeric("open_price", { precision: 18, scale: 6 }),
  closePrice: numeric("close_price", { precision: 18, scale: 6 }),
  stopLoss: numeric("stop_loss", { precision: 18, scale: 6 }),
  takeProfit: numeric("take_profit", { precision: 18, scale: 6 }),
  profit: numeric("profit", { precision: 18, scale: 4 }),
  commission: numeric("commission", { precision: 18, scale: 4 }),
  swap: numeric("swap", { precision: 18, scale: 4 }),
  mt5Ticket: text("mt5_ticket"),                     // MT5 order ticket number
  status: text("status").notNull().default("pending"), // pending | filled | cancelled | rejected
  simulated: boolean("simulated").notNull().default(true),
  comment: text("comment"),
  openedAt: timestamp("opened_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Angel One SmartAPI Accounts ─────────────────────────────────────────────
export const smartApiAccountsTable = pgTable("smartapi_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clientCode: text("client_code").notNull(),
  apiKey: text("api_key").notNull(),
  // tokens
  jwtToken: text("jwt_token"),
  refreshToken: text("refresh_token"),
  feedToken: text("feed_token"),
  jwtExpiresAt: timestamp("jwt_expires_at"),
  // cached profile
  name: text("name"),
  email: text("email"),
  mobile: text("mobile"),
  pan: text("pan"),
  brokerName: text("broker_name").default("Angel One"),
  // funds snapshot
  availableCash: numeric("available_cash", { precision: 18, scale: 2 }),
  totalPnl: numeric("total_pnl", { precision: 18, scale: 2 }),
  // status
  status: text("status").notNull().default("disconnected"),
  lastError: text("last_error"),
  lastConnectedAt: timestamp("last_connected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
