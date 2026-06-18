-- Migration: Add wallet_ledger table
-- Tracks every fund movement (deposits, withdrawals, AI earnings, trades, etc.)
-- Run via: psql $DATABASE_URL -f artifacts/api-server/src/migrations/0001_wallet_ledger.sql

DO $$ BEGIN
  CREATE TYPE ledger_type AS ENUM (
    'deposit_inr','deposit_crypto',
    'withdrawal_inr','withdrawal_crypto',
    'ai_earning','ai_principal_lock','ai_principal_return',
    'transfer_in','transfer_out',
    'trade_fee','trade_buy','trade_sell',
    'earn_deposit','earn_withdrawal','earn_interest',
    'p2p_credit','p2p_debit',
    'referral_bonus',
    'admin_credit','admin_debit',
    'convert',
    'options_pnl','futures_pnl'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER      NOT NULL REFERENCES users(id),
  coin_id         INTEGER      NOT NULL REFERENCES coins(id),
  wallet_type     TEXT         NOT NULL DEFAULT 'spot',
  type            ledger_type  NOT NULL,
  amount          NUMERIC(28,8) NOT NULL,
  balance_before  NUMERIC(28,8) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(28,8) NOT NULL DEFAULT 0,
  ref_type        TEXT,
  ref_id          TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx    ON wallet_ledger(user_id);
CREATE INDEX IF NOT EXISTS wallet_ledger_coin_idx    ON wallet_ledger(coin_id);
CREATE INDEX IF NOT EXISTS wallet_ledger_type_idx    ON wallet_ledger(type);
CREATE INDEX IF NOT EXISTS wallet_ledger_created_idx ON wallet_ledger(created_at);
