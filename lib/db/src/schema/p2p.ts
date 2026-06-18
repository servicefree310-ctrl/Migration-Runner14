import { pgTable, text, serial, timestamp, integer, numeric, boolean, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";

// ─── P2P Payment Methods ────────────────────────────────────────────────
// Per-user payment rails the merchant exposes on their offers (UPI ID,
// IMPS bank account, NEFT bank account, etc.). Buyers send fiat to one
// of these; sellers receive on one of these. Type-tagged so the UI can
// render the right input fields and so the OFFER↔BUYER matching only
// surfaces methods the buyer can actually pay with.
export const p2pPaymentMethodsTable = pgTable("p2p_payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  // upi | imps | neft | bank | paytm | phonepe | gpay
  method: text("method").notNull(),
  // Display name shown to counterparties (e.g. "HDFC Primary", "GPay")
  label: text("label").notNull(),
  // Free-form payee handle: for UPI it's the VPA; for bank/IMPS/NEFT we
  // store account number; for wallets it's the registered phone/handle.
  account: text("account").notNull(),
  // Optional bank metadata for IMPS/NEFT
  ifsc: text("ifsc"),
  holderName: text("holder_name"),
  // Soft-delete flag — keep the row so historical orders can still
  // reference the method that was used at the time of trade.
  active: boolean("active").notNull().default(true),
  // Admin-verified flag — set true after manual or penny-drop verification.
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("p2p_pm_user_idx").on(t.userId),
}));

export type P2pPaymentMethod = typeof p2pPaymentMethodsTable.$inferSelect;

// ─── P2P Offers (Ads) ───────────────────────────────────────────────────
// A merchant ad: "I'm willing to BUY/SELL <coin> at <price> INR for amounts
// between <min> and <max>." Once an offer is posted, other users can open
// orders against it (subject to availableQty). The merchant can pause
// (status=offline) without deleting and resume later.
//
// totalQty = max crypto the merchant is willing to trade through this ad.
// availableQty = remaining after subtracting active in-flight order qty.
// We DON'T do balance escrow at offer time — escrow only locks at the
// moment a counterparty opens an order against the ad. This lets a
// merchant keep a SELL ad up while still trading other markets.
export const p2pOffersTable = pgTable("p2p_offers", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  userId: integer("user_id").notNull(),
  // Merchant's intent — "buy" means merchant wants to BUY crypto from user
  // (counterparty SELLS). "sell" means merchant wants to SELL crypto to
  // user (counterparty BUYS).
  side: text("side").notNull(), // "buy" | "sell"
  coinId: integer("coin_id").notNull(),     // the crypto asset being traded
  fiat: text("fiat").notNull().default("INR"), // INR / USDT-fiat / etc.
  // Price quoted in fiat per 1 unit of coin.
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  // Liquidity bounds in CRYPTO units.
  totalQty: numeric("total_qty", { precision: 28, scale: 8 }).notNull(),
  availableQty: numeric("available_qty", { precision: 28, scale: 8 }).notNull(),
  // Order amount limits in FIAT (so a merchant can say "min ₹500, max ₹50k").
  minFiat: numeric("min_fiat", { precision: 28, scale: 2 }).notNull(),
  maxFiat: numeric("max_fiat", { precision: 28, scale: 2 }).notNull(),
  // Comma-separated payment method types the merchant accepts:
  // e.g. "upi,imps,neft". Matched against the counterparty's saved methods.
  paymentMethods: text("payment_methods").notNull(),
  // Optional: comma-separated IDs of specific saved payment methods the seller
  // wants to expose for this ad (e.g. "42,17"). When set, /seller-methods
  // returns only those accounts instead of all methods of accepted types.
  paymentMethodIds: text("payment_method_ids"),
  // Time the buyer has to mark "paid" before the order auto-cancels (mins).
  payWindowMins: integer("pay_window_mins").notNull().default(15),
  // Free-form terms: KYC requirements, instructions, etc.
  terms: text("terms"),
  // online | offline | closed | suspended (admin)
  status: text("status").notNull().default("online"),
  // Optional: minimum trades count or KYC tier required to open an order.
  minKycLevel: integer("min_kyc_level").notNull().default(1),
  minTrades: integer("min_trades").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  userIdx: index("p2p_offer_user_idx").on(t.userId),
  coinSideIdx: index("p2p_offer_coin_side_idx").on(t.coinId, t.side, t.status),
}));

export type P2pOffer = typeof p2pOffersTable.$inferSelect;

// ─── P2P Orders (Deals) ─────────────────────────────────────────────────
// One actual peer-to-peer deal opened against an offer. Lifecycle:
//   pending  → buyer must pay fiat within payWindowMins
//   paid     → buyer marked as paid, waiting for seller to release
//   released → seller (or admin) confirmed receipt, crypto moved to buyer
//   cancelled→ either side cancelled before fiat was sent (escrow refunded)
//   disputed → either side opened a dispute; admin must resolve
//   expired  → pay window elapsed; auto-cancelled by a sweeper job
//
// Escrow contract: when the order goes from "pending" creation, we MUST
// have already locked `qty` of crypto from the SELLER's spot wallet
// (balance → locked). This is a hard invariant — the release/refund
// helpers below assume the locked balance is reserved for THIS order.
export const p2pOrdersTable = pgTable("p2p_orders", {
  id: serial("id").primaryKey(),
  uid: varchar("uid", { length: 32 }).notNull().unique().$defaultFn(() => ulid()).default(sql`replace(gen_random_uuid()::text, '-', '')`),
  offerId: integer("offer_id").notNull(),
  // Resolved counterparties — populated at order creation so the UI
  // doesn't have to re-read the offer to know who's who.
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  coinId: integer("coin_id").notNull(),
  fiat: text("fiat").notNull().default("INR"),
  // Snapshot of price at order time — frozen even if offer price moves.
  price: numeric("price", { precision: 28, scale: 8 }).notNull(),
  qty: numeric("qty", { precision: 28, scale: 8 }).notNull(),
  fiatAmount: numeric("fiat_amount", { precision: 28, scale: 2 }).notNull(),
  // The chosen payment method (snapshot — kept even if user later deletes
  // the saved method, so dispute resolution still has the original payee).
  paymentMethod: text("payment_method").notNull(),     // upi/imps/etc
  paymentAccount: text("payment_account").notNull(),   // VPA / acct no.
  paymentLabel: text("payment_label").notNull(),       // bank name / handle
  paymentIfsc: text("payment_ifsc"),
  paymentHolderName: text("payment_holder_name"),
  // Optional UTR / reference shared by buyer when marking paid.
  paymentUtr: text("payment_utr"),
  status: text("status").notNull().default("pending"),
  // Timestamps for state transitions — useful for SLA tracking and
  // surfacing "Buyer paid 3 minutes ago" in the deal UI.
  paidAt: timestamp("paid_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Set when EITHER party opens a dispute — also flips status to "disputed".
  disputeOpenedBy: integer("dispute_opened_by"),
  disputeReason: text("dispute_reason"),
  disputeOpenedAt: timestamp("dispute_opened_at", { withTimezone: true }),
  // Admin resolution outcome: "release" (to buyer) | "refund" (to seller)
  disputeResolution: text("dispute_resolution"),
  disputeResolvedBy: integer("dispute_resolved_by"),
  disputeResolvedAt: timestamp("dispute_resolved_at", { withTimezone: true }),
  disputeNotes: text("dispute_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  buyerIdx: index("p2p_order_buyer_idx").on(t.buyerId, t.status),
  sellerIdx: index("p2p_order_seller_idx").on(t.sellerId, t.status),
  offerIdx: index("p2p_order_offer_idx").on(t.offerId),
  statusIdx: index("p2p_order_status_idx").on(t.status),
}));

export type P2pOrder = typeof p2pOrdersTable.$inferSelect;

// ─── P2P Chat Messages ──────────────────────────────────────────────────
// Inline chat between buyer and seller (and admin during disputes).
// Kept simple: text only, no attachments yet — admin can join with role
// "admin" once a dispute is opened.
export const p2pMessagesTable = pgTable("p2p_messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  senderId: integer("sender_id").notNull(),
  // "buyer" | "seller" | "admin" | "system" — system messages capture
  // state-transitions ("Buyer marked as paid", "Admin released funds")
  // so the chat doubles as an audit log.
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orderIdx: index("p2p_msg_order_idx").on(t.orderId, t.createdAt),
}));

export type P2pMessage = typeof p2pMessagesTable.$inferSelect;

// ─── P2P Disputes ───────────────────────────────────────────────────────
// Dedicated dispute record per P2P order — one-to-one with p2p_orders
// (orderId is unique). The legacy embedded dispute_* columns on
// p2p_orders are kept for backward-compat during the migration window
// but new disputes are also written here so admin tooling, audit, and
// SLA dashboards can query disputes independently of the order table.
//
// Status lifecycle: open → resolved (release|refund) | escalated
//   - "release" = admin pushed escrow to buyer
//   - "refund"  = admin refunded escrow to seller
//   - "escalated" = needs manual review beyond the on-platform agent
export const p2pDisputesTable = pgTable("p2p_disputes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  openedBy: integer("opened_by").notNull(),
  // Snapshot of buyer/seller at dispute time so the admin queue
  // doesn't need to re-join with p2p_orders for the basic display.
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  reason: text("reason").notNull(),
  // Optional payment-evidence URL (object-storage path / external link)
  // for the future screenshots feature — column added now to avoid a
  // second migration when the upload UI lands.
  evidenceUrl: text("evidence_url"),
  // open | resolved | escalated
  status: text("status").notNull().default("open"),
  // Resolution fields — populated when admin presses release/refund.
  resolution: text("resolution"), // "release" | "refund" | "escalate"
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notes: text("notes"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  statusIdx: index("p2p_dispute_status_idx").on(t.status, t.openedAt),
  buyerIdx: index("p2p_dispute_buyer_idx").on(t.buyerId),
  sellerIdx: index("p2p_dispute_seller_idx").on(t.sellerId),
}));

export type P2pDispute = typeof p2pDisputesTable.$inferSelect;

// ─── P2P Ratings ────────────────────────────────────────────────────────
// One rating per completed/cancelled order per participant. After a trade
// reaches status "released" or "cancelled", each party can leave a 1–5
// star review with an optional comment for the counterparty.
// Unique on (order_id, rater_id) — enforced in application layer.
export const p2pRatingsTable = pgTable("p2p_ratings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  raterId: integer("rater_id").notNull(),
  ratedId: integer("rated_id").notNull(),
  score: integer("score").notNull(), // 1–5
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orderRaterIdx: index("p2p_rating_order_rater_idx").on(t.orderId, t.raterId),
  ratedIdx: index("p2p_rating_rated_idx").on(t.ratedId),
}));

export type P2pRating = typeof p2pRatingsTable.$inferSelect;
