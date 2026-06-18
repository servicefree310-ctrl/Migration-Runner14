import { pgTable, serial, integer, text, timestamp, numeric, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

// ─── Supported chains (Solana, BSC, Ethereum, Polygon, Arbitrum, etc.) ───────
// chainKey is the short identifier we expose in URLs/payloads ("solana", "bsc",
// "eth", "polygon", "arbitrum", "avalanche", "optimism", "base"). chainId is
// the EVM numeric chain id where applicable (1, 56, 137, …) or 0 for non-EVM.
export const web3NetworksTable = pgTable("web3_networks", {
  id: serial("id").primaryKey(),
  chainKey: text("chain_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  chainId: integer("chain_id").notNull().default(0),     // EVM only; 0 for Solana etc.
  nativeSymbol: text("native_symbol").notNull(),         // ETH / BNB / SOL / MATIC …
  rpcUrl: text("rpc_url").notNull(),
  explorerUrl: text("explorer_url").notNull(),           // base URL — append /tx/<hash>
  logoUrl: text("logo_url"),
  family: text("family").notNull().default("evm"),       // 'evm' | 'solana' | 'cosmos' | …
  status: text("status").notNull().default("active"),    // active | maintenance | disabled
  bridgeFeeBps: integer("bridge_fee_bps").notNull().default(15), // 0.15% bridge fee
  swapFeeBps:   integer("swap_fee_bps").notNull().default(30),   // 0.30% swap fee
  estGasUsd:    numeric("est_gas_usd", { precision: 12, scale: 4 }).notNull().default("0.50"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Web3Network = typeof web3NetworksTable.$inferSelect;

// ─── Tokens per network. Native tokens have isNative=true and contract=null ──
// priceCoinSymbol pins the token to a row in coins.symbol so the swap engine
// can reuse the existing live-price feed (no external Web3 oracle needed).
// e.g. "USDC" on every chain → priceCoinSymbol = "USDC".
export const web3TokensTable = pgTable("web3_tokens", {
  id: serial("id").primaryKey(),
  networkId: integer("network_id").notNull(),
  symbol: text("symbol").notNull(),                      // USDT, WBTC, BNB, SOL, …
  name: text("name").notNull(),
  contractAddress: text("contract_address"),             // null for native
  decimals: integer("decimals").notNull().default(18),
  isNative: boolean("is_native").notNull().default(false),
  priceCoinSymbol: text("price_coin_symbol").notNull(),  // pins to coins.symbol for live USD price
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("active"),
  isStablecoin: boolean("is_stablecoin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPerNetwork: uniqueIndex("web3_tokens_network_symbol_idx").on(t.networkId, t.symbol),
  byNetwork: index("web3_tokens_network_idx").on(t.networkId, t.status),
}));
export type Web3Token = typeof web3TokensTable.$inferSelect;

// ─── User-saved wallets (read-only; we never custody private keys here) ──────
// `kind` distinguishes:
//   "watch"    — user pasted an address we just track for portfolio view
//   "external" — user connected via WalletConnect/MetaMask/Phantom (signed once)
// The latter still doesn't store a private key — connection state is only in
// the browser; this row is a hint that the wallet has been seen.
export const web3WalletsTable = pgTable("web3_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  networkId: integer("network_id").notNull(),
  address: text("address").notNull(),
  label: text("label").notNull().default(""),
  kind: text("kind").notNull().default("watch"),         // watch | external
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPerUserAddr: uniqueIndex("web3_wallets_user_addr_idx").on(t.userId, t.networkId, t.address),
  byUser: index("web3_wallets_user_idx").on(t.userId),
}));
export type Web3Wallet = typeof web3WalletsTable.$inferSelect;

// ─── Swap history (intra-chain DEX swap, executed against user's exchange wallet) ──
// We don't run a real on-chain TX in v1 — the swap is a synthetic move within
// the user's exchange wallet (debit one coin, credit another at the live USD
// rate minus the configured swapFeeBps). txHash stays null until/unless the
// user later signs an on-chain version through WalletConnect.
export const web3SwapsTable = pgTable("web3_swaps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  networkId: integer("network_id").notNull(),
  fromTokenId: integer("from_token_id").notNull(),
  toTokenId: integer("to_token_id").notNull(),
  fromAmount: numeric("from_amount", { precision: 36, scale: 18 }).notNull(),
  toAmount: numeric("to_amount", { precision: 36, scale: 18 }).notNull(),
  rate: numeric("rate", { precision: 36, scale: 18 }).notNull(),
  slippageBps: integer("slippage_bps").notNull().default(50),     // 0.50%
  feeUsd: numeric("fee_usd", { precision: 18, scale: 6 }).notNull().default("0"),
  gasUsd: numeric("gas_usd", { precision: 18, scale: 6 }).notNull().default("0"),
  txHash: text("tx_hash"),                                         // populated for real on-chain swaps
  status: text("status").notNull().default("completed"),           // pending | completed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("web3_swaps_user_idx").on(t.userId, t.createdAt),
}));
export type Web3Swap = typeof web3SwapsTable.$inferSelect;

// ─── Bridge transfers (cross-chain, e.g. USDT BSC → USDT Solana) ─────────────
// Two-leg lifecycle: src tx debits the source chain wallet, dst tx credits the
// destination chain wallet. status moves: pending → src_confirmed → completed.
// In v1 this is simulated synchronously — we mark completed instantly minus
// fee. Real-bridge integration is wired through the same row.
export const web3BridgesTable = pgTable("web3_bridges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fromNetworkId: integer("from_network_id").notNull(),
  toNetworkId: integer("to_network_id").notNull(),
  tokenSymbol: text("token_symbol").notNull(),                     // USDT, USDC, …  (must exist on both sides)
  fromAmount: numeric("from_amount", { precision: 36, scale: 18 }).notNull(),
  toAmount:   numeric("to_amount",   { precision: 36, scale: 18 }).notNull(),
  feeUsd:     numeric("fee_usd",     { precision: 18, scale: 6  }).notNull().default("0"),
  srcTxHash: text("src_tx_hash"),
  dstTxHash: text("dst_tx_hash"),
  status: text("status").notNull().default("completed"),           // pending | src_confirmed | completed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  byUser: index("web3_bridges_user_idx").on(t.userId, t.createdAt),
}));
export type Web3Bridge = typeof web3BridgesTable.$inferSelect;
