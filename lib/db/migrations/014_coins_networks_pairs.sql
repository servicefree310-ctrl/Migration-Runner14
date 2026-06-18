-- Migration 014: Ensure coins, networks, and pairs tables exist with correct schema
-- Data is seeded via scripts/seed.ts — run: cd artifacts/api-server && npx tsx scripts/seed.ts
-- This file ensures the required indexes exist for performance.

-- Coins
CREATE INDEX IF NOT EXISTS idx_coins_symbol      ON coins (symbol);
CREATE INDEX IF NOT EXISTS idx_coins_type        ON coins (type);
CREATE INDEX IF NOT EXISTS idx_coins_status      ON coins (status);
CREATE INDEX IF NOT EXISTS idx_coins_is_listed   ON coins (is_listed);
CREATE INDEX IF NOT EXISTS idx_coins_market_rank ON coins (market_cap_rank);

-- Networks (multi-network per coin)
CREATE INDEX IF NOT EXISTS idx_networks_coin_id ON networks (coin_id);
CREATE INDEX IF NOT EXISTS idx_networks_chain   ON networks (chain);
CREATE INDEX IF NOT EXISTS idx_networks_status  ON networks (status);

-- Pairs (INR / USDT / BTC)
CREATE INDEX IF NOT EXISTS idx_pairs_symbol          ON pairs (symbol);
CREATE INDEX IF NOT EXISTS idx_pairs_base_coin_id    ON pairs (base_coin_id);
CREATE INDEX IF NOT EXISTS idx_pairs_quote_coin_id   ON pairs (quote_coin_id);
CREATE INDEX IF NOT EXISTS idx_pairs_trading_enabled ON pairs (trading_enabled);
CREATE INDEX IF NOT EXISTS idx_pairs_status          ON pairs (status);
