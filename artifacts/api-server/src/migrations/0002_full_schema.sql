-- ============================================================
-- Full schema migration — Zebvix CryptoX Exchange
-- Covers all 38+ domain tables.
-- Run with: psql $DATABASE_URL -f 0002_full_schema.sql
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enum types ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM (
    'new_user','kyc_submitted','kyc_approved','kyc_rejected',
    'large_withdrawal','large_trade','pair_added','user_suspended',
    'balance_adjust','2fa_enabled','2fa_disabled','backup_code_used',
    'email_verified','phone_verified','password_reset','settings_changed',
    'withdrawal_approved','withdrawal_rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low','medium','high','ultra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inr_tx_type   AS ENUM ('deposit','withdrawal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inr_tx_status AS ENUM ('pending','processing','completed','failed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inr_method    AS ENUM ('upi','bank_transfer','neft','rtgs','imps');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_type AS ENUM (
    'deposit_inr','deposit_crypto',
    'withdrawal_inr','withdrawal_crypto',
    'trade_buy','trade_sell',
    'fee','referral_bonus','earn_reward',
    'futures_pnl','futures_fee','funding_payment',
    'options_premium','options_settlement',
    'p2p_escrow_lock','p2p_escrow_release','p2p_escrow_refund',
    'convert','transfer_in','transfer_out',
    'copy_trade_pnl','bot_trade','adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status   AS ENUM ('open','in_progress','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_category AS ENUM ('general','kyc','deposit','withdrawal','trading','technical','account');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE msg_sender_type AS ENUM ('user','admin','bot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT UNIQUE,
  password_hash   TEXT,
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT UNIQUE,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'user',
  status          TEXT NOT NULL DEFAULT 'active',
  referral_code   TEXT UNIQUE,
  referred_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kyc_level       INTEGER NOT NULL DEFAULT 0,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_email_idx    ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx     ON users(role);
CREATE INDEX IF NOT EXISTS users_referral_idx ON users(referral_code);

-- ── 2. sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  ip          TEXT,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_idx   ON sessions(token);

-- ── 3. otp_codes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_recipient_purpose_idx ON otp_codes(recipient, purpose);

-- ── 4. kyc_records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_records (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  full_name       TEXT,
  dob             TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  country         TEXT,
  postal_code     TEXT,
  pan_number      TEXT,
  aadhaar_number  TEXT,
  passport_number TEXT,
  selfie_url      TEXT,
  id_front_url    TEXT,
  id_back_url     TEXT,
  address_proof_url TEXT,
  rejection_reason TEXT,
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kyc_user_id_idx  ON kyc_records(user_id);
CREATE INDEX IF NOT EXISTS kyc_status_idx   ON kyc_records(status);

-- ── 5. bank_accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name      TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc           TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  branch         TEXT,
  account_type   TEXT NOT NULL DEFAULT 'savings',
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  rejected       BOOLEAN NOT NULL DEFAULT FALSE,
  reject_reason  TEXT,
  reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bank_accounts_user_idx ON bank_accounts(user_id);

-- ── 6. coins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coins (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'crypto',
  decimals        INTEGER NOT NULL DEFAULT 8,
  logo_url        TEXT,
  description     TEXT,
  website_url     TEXT,
  whitepaper_url  TEXT,
  coingecko_id    TEXT,
  cmc_id          INTEGER,
  current_price   NUMERIC(28, 8) NOT NULL DEFAULT '0',
  market_cap_usd  NUMERIC(28, 2),
  volume_24h_usd  NUMERIC(28, 2),
  circulating_supply NUMERIC(28, 8),
  max_supply      NUMERIC(28, 8),
  price_change_24h NUMERIC(10, 4),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_deposit_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  is_withdraw_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_withdraw    NUMERIC(28, 8) NOT NULL DEFAULT '0',
  max_withdraw    NUMERIC(28, 8),
  withdraw_fee    NUMERIC(28, 8) NOT NULL DEFAULT '0',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coins_symbol_idx    ON coins(symbol);
CREATE INDEX IF NOT EXISTS coins_is_active_idx ON coins(is_active);

-- ── 7. exchange_settings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. fee_config ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_config (
  id                     SERIAL PRIMARY KEY,
  default_maker_fee      NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  default_taker_fee      NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  withdrawal_fee_percent NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. gateways ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gateways (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  direction   TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}',
  min_amount  NUMERIC(18, 2),
  max_amount  NUMERIC(18, 2),
  fee_percent NUMERIC(10, 6) NOT NULL DEFAULT '0',
  fee_fixed   NUMERIC(18, 2) NOT NULL DEFAULT '0',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. wallets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_type  TEXT NOT NULL,
  coin_id      INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
  balance      NUMERIC(28, 8) NOT NULL DEFAULT '0',
  locked       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wallet_type, coin_id)
);
CREATE INDEX IF NOT EXISTS wallets_user_id_idx   ON wallets(user_id);
CREATE INDEX IF NOT EXISTS wallets_coin_id_idx   ON wallets(coin_id);

-- ── 11. wallet_ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id       INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
  wallet_type   TEXT NOT NULL DEFAULT 'spot',
  type          ledger_type NOT NULL,
  amount        NUMERIC(28, 8) NOT NULL,
  fee           NUMERIC(28, 8) NOT NULL DEFAULT '0',
  balance_after NUMERIC(28, 8) NOT NULL,
  ref_id        TEXT,
  ref_type      TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_coin_idx ON wallet_ledger(user_id, coin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_type_idx      ON wallet_ledger(type, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_ref_idx       ON wallet_ledger(ref_id, ref_type);

-- ── 12. deposit_addresses ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id     INTEGER NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
  network_id  INTEGER NOT NULL,
  address     TEXT NOT NULL,
  memo        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, coin_id, network_id)
);
CREATE INDEX IF NOT EXISTS deposit_addresses_user_idx    ON deposit_addresses(user_id);
CREATE INDEX IF NOT EXISTS deposit_addresses_address_idx ON deposit_addresses(address);

-- ── 13. wallet_addresses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id  INTEGER NOT NULL,
  address     TEXT NOT NULL,
  memo        TEXT,
  label       TEXT,
  is_whitelisted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wallet_addresses_user_idx ON wallet_addresses(user_id);

-- ── 14. master_wallets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_wallets (
  id              SERIAL PRIMARY KEY,
  coin            TEXT NOT NULL,
  network         TEXT NOT NULL,
  label           TEXT NOT NULL,
  deposit_address TEXT,
  is_cold         BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 15. INR transactions (deposits / withdrawals) ────────────────────────────
CREATE TABLE IF NOT EXISTS inr_deposits (
  id                 SERIAL PRIMARY KEY,
  uid                VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gateway_id         INTEGER NOT NULL REFERENCES gateways(id),
  bank_id            INTEGER REFERENCES bank_accounts(id),
  amount             NUMERIC(18, 2) NOT NULL,
  fee                NUMERIC(18, 2) NOT NULL DEFAULT '0',
  ref_id             TEXT NOT NULL UNIQUE,
  utr                TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  notes              TEXT,
  reviewed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  gateway_order_id   TEXT,
  gateway_payment_id TEXT,
  gateway_method     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS inr_deposits_user_idx    ON inr_deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inr_deposits_status_idx  ON inr_deposits(status);

CREATE TABLE IF NOT EXISTS inr_withdrawals (
  id            SERIAL PRIMARY KEY,
  uid           VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_id       INTEGER NOT NULL REFERENCES bank_accounts(id),
  amount        NUMERIC(18, 2) NOT NULL,
  fee           NUMERIC(18, 2) NOT NULL DEFAULT '0',
  ref_id        TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS inr_withdrawals_user_idx   ON inr_withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inr_withdrawals_status_idx ON inr_withdrawals(status);

CREATE TABLE IF NOT EXISTS inr_transactions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        inr_tx_type NOT NULL,
  method      inr_method NOT NULL,
  status      inr_tx_status NOT NULL DEFAULT 'pending',
  amount      NUMERIC(18, 2) NOT NULL,
  fee         NUMERIC(18, 2) NOT NULL DEFAULT '0',
  utr         TEXT,
  ref_id      TEXT,
  gateway_id  INTEGER REFERENCES gateways(id),
  bank_id     INTEGER REFERENCES bank_accounts(id),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 16. crypto deposits / withdrawals ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_deposits (
  id                     SERIAL PRIMARY KEY,
  uid                    VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id                INTEGER NOT NULL REFERENCES coins(id),
  network_id             INTEGER NOT NULL,
  amount                 NUMERIC(28, 8) NOT NULL,
  address                TEXT NOT NULL,
  from_address           TEXT,
  tx_hash                TEXT,
  block_number           INTEGER,
  log_index              INTEGER,
  confirmations          INTEGER NOT NULL DEFAULT 0,
  required_confirmations INTEGER NOT NULL DEFAULT 12,
  status                 TEXT NOT NULL DEFAULT 'pending',
  detected_by            TEXT NOT NULL DEFAULT 'manual',
  sweep_status           TEXT,
  sweep_tx_hash          TEXT,
  swept_at               TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at           TIMESTAMPTZ,
  UNIQUE (network_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS crypto_deposits_user_idx   ON crypto_deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crypto_deposits_status_idx ON crypto_deposits(status);
CREATE INDEX IF NOT EXISTS crypto_deposits_addr_idx   ON crypto_deposits(address);

CREATE TABLE IF NOT EXISTS crypto_withdrawals (
  id            SERIAL PRIMARY KEY,
  uid           VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id       INTEGER NOT NULL REFERENCES coins(id),
  network_id    INTEGER NOT NULL,
  amount        NUMERIC(28, 8) NOT NULL,
  fee           NUMERIC(28, 8) NOT NULL DEFAULT '0',
  to_address    TEXT NOT NULL,
  memo          TEXT,
  tx_hash       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  broadcasted_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crypto_withdrawals_user_idx   ON crypto_withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crypto_withdrawals_status_idx ON crypto_withdrawals(status);

CREATE TABLE IF NOT EXISTS transfers (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_wallet  TEXT NOT NULL,
  to_wallet    TEXT NOT NULL,
  coin_id      INTEGER NOT NULL REFERENCES coins(id),
  amount       NUMERIC(28, 8) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'completed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 17. orders (spot) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  uid            VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_id        INTEGER NOT NULL,
  side           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'limit',
  price          NUMERIC(28, 8),
  qty            NUMERIC(28, 8) NOT NULL,
  filled_qty     NUMERIC(28, 8) NOT NULL DEFAULT '0',
  avg_fill_price NUMERIC(28, 8) NOT NULL DEFAULT '0',
  stop_price     NUMERIC(28, 8),
  status         TEXT NOT NULL DEFAULT 'OPEN',
  fee            NUMERIC(28, 8) NOT NULL DEFAULT '0',
  fee_asset      TEXT,
  tif            TEXT NOT NULL DEFAULT 'GTC',
  is_bot         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_idx      ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pair_idx      ON orders(pair_id, status);
CREATE INDEX IF NOT EXISTS orders_status_idx    ON orders(status, created_at DESC);

-- ── 18. trades (spot fills) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  pair_id         INTEGER NOT NULL,
  taker_order_id  INTEGER NOT NULL REFERENCES orders(id),
  maker_order_id  INTEGER NOT NULL REFERENCES orders(id),
  taker_user_id   INTEGER NOT NULL REFERENCES users(id),
  maker_user_id   INTEGER NOT NULL REFERENCES users(id),
  taker_side      TEXT NOT NULL,
  price           NUMERIC(28, 8) NOT NULL,
  qty             NUMERIC(28, 8) NOT NULL,
  taker_fee       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  maker_fee       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trades_pair_created_idx       ON trades(pair_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_taker_user_idx         ON trades(taker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_maker_user_idx         ON trades(maker_user_id, created_at DESC);

-- ── 19. funding_rates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funding_rates (
  id             SERIAL PRIMARY KEY,
  pair_id        INTEGER NOT NULL,
  rate           NUMERIC(10, 6) NOT NULL DEFAULT '0',
  interval_hours INTEGER NOT NULL DEFAULT 8,
  funding_time   TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS funding_rates_pair_idx ON funding_rates(pair_id, funding_time DESC);

-- ── 20. futures ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS futures_positions (
  id                SERIAL PRIMARY KEY,
  uid               VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_id           INTEGER NOT NULL,
  side              TEXT NOT NULL,
  leverage          INTEGER NOT NULL DEFAULT 10,
  qty               NUMERIC(28, 8) NOT NULL,
  entry_price       NUMERIC(28, 8) NOT NULL,
  mark_price        NUMERIC(28, 8) NOT NULL DEFAULT '0',
  margin_amount     NUMERIC(28, 8) NOT NULL,
  margin_type       TEXT NOT NULL DEFAULT 'isolated',
  unrealized_pnl    NUMERIC(28, 8) NOT NULL DEFAULT '0',
  liquidation_price NUMERIC(28, 8) NOT NULL DEFAULT '0',
  status            TEXT NOT NULL DEFAULT 'open',
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  close_reason      TEXT,
  realized_pnl      NUMERIC(28, 8) NOT NULL DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS futures_positions_user_idx ON futures_positions(user_id, status);
CREATE INDEX IF NOT EXISTS futures_positions_pair_idx ON futures_positions(pair_id, status);

CREATE TABLE IF NOT EXISTS futures_orders (
  id             SERIAL PRIMARY KEY,
  uid            VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_id        INTEGER NOT NULL,
  side           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'limit',
  price          NUMERIC(28, 8),
  qty            NUMERIC(28, 8) NOT NULL,
  filled_qty     NUMERIC(28, 8) NOT NULL DEFAULT '0',
  avg_fill_price NUMERIC(28, 8) NOT NULL DEFAULT '0',
  leverage       INTEGER NOT NULL DEFAULT 10,
  margin_type    TEXT NOT NULL DEFAULT 'isolated',
  margin_locked  NUMERIC(28, 8) NOT NULL DEFAULT '0',
  reduce_only    BOOLEAN NOT NULL DEFAULT FALSE,
  stop_loss      NUMERIC(28, 8),
  take_profit    NUMERIC(28, 8),
  status         TEXT NOT NULL DEFAULT 'OPEN',
  fee            NUMERIC(28, 8) NOT NULL DEFAULT '0',
  position_id    INTEGER REFERENCES futures_positions(id),
  is_bot         INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS futures_orders_pair_status_idx   ON futures_orders(pair_id, status);
CREATE INDEX IF NOT EXISTS futures_orders_user_created_idx  ON futures_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS futures_trades (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  pair_id         INTEGER NOT NULL,
  taker_order_id  INTEGER NOT NULL,
  maker_order_id  INTEGER NOT NULL,
  taker_user_id   INTEGER NOT NULL REFERENCES users(id),
  maker_user_id   INTEGER NOT NULL REFERENCES users(id),
  taker_side      TEXT NOT NULL,
  price           NUMERIC(28, 8) NOT NULL,
  qty             NUMERIC(28, 8) NOT NULL,
  taker_fee       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  maker_fee       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS futures_trades_pair_created_idx ON futures_trades(pair_id, created_at DESC);
CREATE INDEX IF NOT EXISTS futures_trades_taker_user_idx   ON futures_trades(taker_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS funding_payments (
  id               SERIAL PRIMARY KEY,
  position_id      INTEGER NOT NULL REFERENCES futures_positions(id),
  user_id          INTEGER NOT NULL REFERENCES users(id),
  pair_id          INTEGER NOT NULL,
  funding_rate_id  INTEGER NOT NULL REFERENCES funding_rates(id),
  rate             NUMERIC(10, 6) NOT NULL,
  position_value   NUMERIC(28, 8) NOT NULL,
  payment          NUMERIC(28, 8) NOT NULL,
  paid_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (funding_rate_id, position_id)
);

-- ── 21. options ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS option_contracts (
  id                  SERIAL PRIMARY KEY,
  symbol              TEXT NOT NULL UNIQUE,
  underlying_coin_id  INTEGER NOT NULL REFERENCES coins(id),
  quote_coin_symbol   TEXT NOT NULL DEFAULT 'USDT',
  option_type         TEXT NOT NULL,
  strike_price        NUMERIC(28, 8) NOT NULL,
  expiry_at           TIMESTAMPTZ NOT NULL,
  iv_bps              INTEGER NOT NULL DEFAULT 8000,
  risk_free_rate_bps  INTEGER NOT NULL DEFAULT 500,
  contract_size       NUMERIC(28, 8) NOT NULL DEFAULT '1',
  min_qty             NUMERIC(28, 8) NOT NULL DEFAULT '0.01',
  status              TEXT NOT NULL DEFAULT 'active',
  settlement_price    NUMERIC(28, 8),
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS option_contracts_status_expiry_idx ON option_contracts(status, expiry_at);
CREATE INDEX IF NOT EXISTS option_contracts_underlying_idx    ON option_contracts(underlying_coin_id, expiry_at);

CREATE TABLE IF NOT EXISTS option_orders (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id         INTEGER NOT NULL REFERENCES option_contracts(id),
  side                TEXT NOT NULL,
  qty                 NUMERIC(28, 8) NOT NULL,
  premium             NUMERIC(28, 8) NOT NULL,
  mark_price_at_fill  NUMERIC(28, 8) NOT NULL,
  fee                 NUMERIC(28, 8) NOT NULL DEFAULT '0',
  status              TEXT NOT NULL DEFAULT 'FILLED',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS option_orders_user_idx     ON option_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS option_orders_contract_idx ON option_orders(contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS option_positions (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_id        INTEGER NOT NULL REFERENCES option_contracts(id),
  side               TEXT NOT NULL,
  qty                NUMERIC(28, 8) NOT NULL,
  avg_entry_premium  NUMERIC(28, 8) NOT NULL,
  margin_locked      NUMERIC(28, 8) NOT NULL DEFAULT '0',
  realized_pnl       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  status             TEXT NOT NULL DEFAULT 'open',
  opened_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at          TIMESTAMPTZ,
  close_reason       TEXT,
  UNIQUE (user_id, contract_id, side, status)
);
CREATE INDEX IF NOT EXISTS option_positions_user_idx ON option_positions(user_id, status);

-- ── 22. activity_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_events (
  id          SERIAL PRIMARY KEY,
  type        activity_type NOT NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  amount      NUMERIC(28, 8),
  coin        TEXT,
  meta        JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_events_user_idx    ON activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_idx    ON activity_events(type, created_at DESC);

-- ── 23. ai_trading_plans ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_trading_plans (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  risk_level      risk_level NOT NULL DEFAULT 'medium',
  min_investment  NUMERIC(28, 8) NOT NULL DEFAULT '0',
  max_investment  NUMERIC(28, 8),
  monthly_fee     NUMERIC(28, 8) NOT NULL DEFAULT '0',
  expected_apy    NUMERIC(8, 4),
  coins           TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_trading_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id      INTEGER NOT NULL REFERENCES ai_trading_plans(id),
  amount       NUMERIC(28, 8) NOT NULL,
  coin_id      INTEGER NOT NULL REFERENCES coins(id),
  status       TEXT NOT NULL DEFAULT 'active',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_subs_user_idx ON ai_trading_subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS ai_trading_transactions (
  id          SERIAL PRIMARY KEY,
  sub_id      INTEGER NOT NULL REFERENCES ai_trading_subscriptions(id),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  amount      NUMERIC(28, 8) NOT NULL,
  coin_id     INTEGER NOT NULL REFERENCES coins(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 24. trading_bots ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_bots (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  bot_type     TEXT NOT NULL,
  pair_id      INTEGER NOT NULL,
  coin_id      INTEGER NOT NULL REFERENCES coins(id),
  config       JSONB NOT NULL DEFAULT '{}',
  invested     NUMERIC(28, 8) NOT NULL DEFAULT '0',
  current_val  NUMERIC(28, 8) NOT NULL DEFAULT '0',
  total_profit NUMERIC(28, 8) NOT NULL DEFAULT '0',
  total_trades INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'running',
  is_bot       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_bots_user_idx ON trading_bots(user_id, status);

-- ── 25. broker_accounts & instruments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_config (
  id            SERIAL PRIMARY KEY,
  broker        TEXT NOT NULL DEFAULT 'angelone',
  api_key       TEXT,
  client_id     TEXT,
  totp_secret   TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  last_token_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broker_accounts (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  angel_client_id  TEXT,
  angel_api_key    TEXT,
  angel_totp_secret TEXT,
  jwttoken         TEXT,
  refresh_token    TEXT,
  feed_token       TEXT,
  broker           TEXT NOT NULL DEFAULT 'angelone',
  status           TEXT NOT NULL DEFAULT 'pending',
  is_connected     BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS broker_accounts_user_idx ON broker_accounts(user_id);

CREATE TABLE IF NOT EXISTS instruments (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  name            TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  segment         TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  lot_size        INTEGER NOT NULL DEFAULT 1,
  tick_size       NUMERIC(14, 4) NOT NULL DEFAULT '0.05',
  expiry          TEXT,
  strike_price    NUMERIC(14, 2),
  option_type     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  token           TEXT,
  isin            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS instruments_symbol_idx   ON instruments(symbol, exchange);
CREATE INDEX IF NOT EXISTS instruments_segment_idx  ON instruments(segment, instrument_type);

-- ── 26. legal_pages (CMS) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_pages (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 27. convert_quotes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS convert_quotes (
  id            SERIAL PRIMARY KEY,
  uid           VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_coin_id  INTEGER NOT NULL REFERENCES coins(id),
  to_coin_id    INTEGER NOT NULL REFERENCES coins(id),
  from_amount   NUMERIC(28, 8) NOT NULL,
  to_amount     NUMERIC(28, 8) NOT NULL,
  rate          NUMERIC(28, 8) NOT NULL,
  fee           NUMERIC(28, 8) NOT NULL DEFAULT '0',
  fee_coin_id   INTEGER REFERENCES coins(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  expires_at    TIMESTAMPTZ NOT NULL,
  executed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS convert_quotes_user_idx ON convert_quotes(user_id, created_at DESC);

-- ── 28. copy_trading ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trader_profiles (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name     TEXT NOT NULL,
  bio              TEXT NOT NULL DEFAULT '',
  avatar_url       TEXT,
  strategy_desc    TEXT,
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  aum              NUMERIC(28, 8) NOT NULL DEFAULT '0',
  total_pnl        NUMERIC(28, 8) NOT NULL DEFAULT '0',
  roi_30d          NUMERIC(10, 4) NOT NULL DEFAULT '0',
  win_rate         NUMERIC(6, 4) NOT NULL DEFAULT '0',
  copy_fee_pct     NUMERIC(6, 4) NOT NULL DEFAULT '0',
  min_copy_amount  NUMERIC(28, 8) NOT NULL DEFAULT '10',
  max_copiers      INTEGER NOT NULL DEFAULT 100,
  current_copiers  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copy_positions (
  id                SERIAL PRIMARY KEY,
  copier_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trader_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allocated_amount  NUMERIC(28, 8) NOT NULL,
  coin_id           INTEGER NOT NULL REFERENCES coins(id),
  current_value     NUMERIC(28, 8) NOT NULL DEFAULT '0',
  realized_pnl      NUMERIC(28, 8) NOT NULL DEFAULT '0',
  unrealized_pnl    NUMERIC(28, 8) NOT NULL DEFAULT '0',
  status            TEXT NOT NULL DEFAULT 'active',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS copy_positions_copier_idx  ON copy_positions(copier_user_id, status);
CREATE INDEX IF NOT EXISTS copy_positions_trader_idx  ON copy_positions(trader_user_id);

-- ── 29. dashboard_layouts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default',
  is_default  INTEGER NOT NULL DEFAULT 0,
  layout      JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS dashboard_layouts_user_idx ON dashboard_layouts(user_id);

-- ── 30. earn_products & subscriptions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS earn_products (
  id               SERIAL PRIMARY KEY,
  coin_id          INTEGER NOT NULL REFERENCES coins(id),
  name             TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  type             TEXT NOT NULL,
  apy              NUMERIC(8, 4) NOT NULL DEFAULT '0',
  lock_period_days INTEGER NOT NULL DEFAULT 0,
  min_amount       NUMERIC(28, 8) NOT NULL DEFAULT '0',
  max_amount       NUMERIC(28, 8),
  total_capacity   NUMERIC(28, 8),
  current_staked   NUMERIC(28, 8) NOT NULL DEFAULT '0',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS earn_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES earn_products(id),
  amount       NUMERIC(28, 8) NOT NULL,
  apy_at_sub   NUMERIC(8, 4) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  accrued      NUMERIC(28, 8) NOT NULL DEFAULT '0',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matures_at   TIMESTAMPTZ,
  redeemed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS earn_subscriptions_user_idx ON earn_subscriptions(user_id, status);

-- ── 31. market_bots ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_bots (
  id              SERIAL PRIMARY KEY,
  pair_id         INTEGER NOT NULL UNIQUE,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  spread_bps      INTEGER NOT NULL DEFAULT 20,
  levels          INTEGER NOT NULL DEFAULT 5,
  qty_per_level   NUMERIC(28, 8) NOT NULL DEFAULT '0.1',
  qty_variance    NUMERIC(6, 4) NOT NULL DEFAULT '0.1',
  refresh_secs    INTEGER NOT NULL DEFAULT 5,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 32. user_notifications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'system',
  title       TEXT NOT NULL,
  body        TEXT,
  cta_label   TEXT,
  cta_url     TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_notifications_user_idx   ON user_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_kind_idx   ON user_notifications(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  body        TEXT,
  cta_label   TEXT,
  cta_url     TEXT,
  target_role TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS broadcast_notif_active_idx ON broadcast_notifications(is_active, created_at DESC);

-- ── 33. p2p ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2p_payment_methods (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method      TEXT NOT NULL,
  label       TEXT NOT NULL,
  account     TEXT NOT NULL,
  ifsc        TEXT,
  holder_name TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_pm_user_idx ON p2p_payment_methods(user_id);

CREATE TABLE IF NOT EXISTS p2p_offers (
  id               SERIAL PRIMARY KEY,
  uid              VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side             TEXT NOT NULL,
  coin_id          INTEGER NOT NULL REFERENCES coins(id),
  fiat             TEXT NOT NULL DEFAULT 'INR',
  price            NUMERIC(28, 8) NOT NULL,
  total_qty        NUMERIC(28, 8) NOT NULL,
  available_qty    NUMERIC(28, 8) NOT NULL,
  min_fiat         NUMERIC(28, 2) NOT NULL,
  max_fiat         NUMERIC(28, 2) NOT NULL,
  payment_methods  TEXT NOT NULL,
  pay_window_mins  INTEGER NOT NULL DEFAULT 15,
  terms            TEXT,
  status           TEXT NOT NULL DEFAULT 'online',
  min_kyc_level    INTEGER NOT NULL DEFAULT 1,
  min_trades       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_offer_user_idx       ON p2p_offers(user_id);
CREATE INDEX IF NOT EXISTS p2p_offer_coin_side_idx  ON p2p_offers(coin_id, side, status);

CREATE TABLE IF NOT EXISTS p2p_orders (
  id                    SERIAL PRIMARY KEY,
  uid                   VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  offer_id              INTEGER NOT NULL REFERENCES p2p_offers(id),
  buyer_id              INTEGER NOT NULL REFERENCES users(id),
  seller_id             INTEGER NOT NULL REFERENCES users(id),
  coin_id               INTEGER NOT NULL REFERENCES coins(id),
  fiat                  TEXT NOT NULL DEFAULT 'INR',
  price                 NUMERIC(28, 8) NOT NULL,
  qty                   NUMERIC(28, 8) NOT NULL,
  fiat_amount           NUMERIC(28, 2) NOT NULL,
  payment_method        TEXT NOT NULL,
  payment_account       TEXT NOT NULL,
  payment_label         TEXT NOT NULL,
  payment_ifsc          TEXT,
  payment_holder_name   TEXT,
  payment_utr           TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
  paid_at               TIMESTAMPTZ,
  released_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ NOT NULL,
  dispute_opened_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dispute_reason        TEXT,
  dispute_opened_at     TIMESTAMPTZ,
  dispute_resolution    TEXT,
  dispute_resolved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dispute_resolved_at   TIMESTAMPTZ,
  dispute_notes         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_order_buyer_idx   ON p2p_orders(buyer_id, status);
CREATE INDEX IF NOT EXISTS p2p_order_seller_idx  ON p2p_orders(seller_id, status);
CREATE INDEX IF NOT EXISTS p2p_order_offer_idx   ON p2p_orders(offer_id);
CREATE INDEX IF NOT EXISTS p2p_order_status_idx  ON p2p_orders(status);

CREATE TABLE IF NOT EXISTS p2p_messages (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  sender_role  TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_msg_order_idx ON p2p_messages(order_id, created_at);

CREATE TABLE IF NOT EXISTS p2p_disputes (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL UNIQUE REFERENCES p2p_orders(id),
  opened_by    INTEGER NOT NULL REFERENCES users(id),
  buyer_id     INTEGER NOT NULL REFERENCES users(id),
  seller_id    INTEGER NOT NULL REFERENCES users(id),
  reason       TEXT NOT NULL,
  evidence_url TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  resolution   TEXT,
  resolved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  notes        TEXT,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p2p_dispute_status_idx  ON p2p_disputes(status, opened_at);
CREATE INDEX IF NOT EXISTS p2p_dispute_buyer_idx   ON p2p_disputes(buyer_id);
CREATE INDEX IF NOT EXISTS p2p_dispute_seller_idx  ON p2p_disputes(seller_id);

-- ── 34. support_tickets ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  category     ticket_category NOT NULL DEFAULT 'general',
  priority     ticket_priority NOT NULL DEFAULT 'normal',
  status       ticket_status NOT NULL DEFAULT 'open',
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx    ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  sender_type msg_sender_type NOT NULL DEFAULT 'user',
  body        TEXT NOT NULL,
  attachments TEXT[] NOT NULL DEFAULT '{}',
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages(ticket_id, created_at);

-- ── 35. user_api_keys ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_api_keys (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id      TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  permissions TEXT[] NOT NULL DEFAULT '{"read"}',
  ip_whitelist TEXT[],
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_api_keys_user_idx  ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_key_idx   ON user_api_keys(key_id);

-- ── 36. listing_rules & candidates ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_rules (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  mode                TEXT NOT NULL DEFAULT 'manual',
  scope               TEXT NOT NULL DEFAULT 'both',
  min_volume_24h_usd  NUMERIC(24, 2) NOT NULL DEFAULT '100000',
  min_market_cap_usd  NUMERIC(24, 2) NOT NULL DEFAULT '1000000',
  min_liquidity_usd   NUMERIC(24, 2) NOT NULL DEFAULT '50000',
  min_age_days        INTEGER NOT NULL DEFAULT 7,
  chains_allowed      JSONB NOT NULL DEFAULT '[]',
  source_filter       JSONB NOT NULL DEFAULT '[]',
  auto_create_pair    BOOLEAN NOT NULL DEFAULT TRUE,
  quote_symbol        TEXT NOT NULL DEFAULT 'USDT',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  priority            INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_sources (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,
  endpoint          TEXT,
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  sync_interval_min INTEGER NOT NULL DEFAULT 15,
  max_items_per_sync INTEGER NOT NULL DEFAULT 50,
  last_sync_at      TIMESTAMPTZ,
  last_sync_count   INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS listing_candidates (
  id               SERIAL PRIMARY KEY,
  source           TEXT NOT NULL,
  source_ref       TEXT NOT NULL,
  chain            TEXT,
  contract_address TEXT,
  symbol           TEXT NOT NULL,
  name             TEXT NOT NULL,
  logo_url         TEXT,
  price_usd        NUMERIC(24, 8) NOT NULL DEFAULT '0',
  market_cap_usd   NUMERIC(24, 2) NOT NULL DEFAULT '0',
  volume_24h_usd   NUMERIC(24, 2) NOT NULL DEFAULT '0',
  liquidity_usd    NUMERIC(24, 2) NOT NULL DEFAULT '0',
  price_change_24h NUMERIC(12, 4) NOT NULL DEFAULT '0',
  age_days         INTEGER NOT NULL DEFAULT 0,
  risk_score       INTEGER NOT NULL DEFAULT 50,
  risk_flags       JSONB NOT NULL DEFAULT '[]',
  raw_data         JSONB,
  status           TEXT NOT NULL DEFAULT 'pending',
  rule_id          INTEGER REFERENCES listing_rules(id),
  decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,
  listed_coin_id   INTEGER REFERENCES coins(id),
  discovered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_ref)
);
CREATE INDEX IF NOT EXISTS listing_candidates_status_idx  ON listing_candidates(status, discovered_at);
CREATE INDEX IF NOT EXISTS listing_candidates_symbol_idx  ON listing_candidates(symbol);

-- ── 37. web3 ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web3_networks (
  id              SERIAL PRIMARY KEY,
  chain_key       TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  chain_id        INTEGER NOT NULL DEFAULT 0,
  rpc_url         TEXT,
  explorer_url    TEXT,
  native_symbol   TEXT NOT NULL DEFAULT 'ETH',
  is_evm          BOOLEAN NOT NULL DEFAULT TRUE,
  is_testnet      BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS web3_tokens (
  id                SERIAL PRIMARY KEY,
  network_id        INTEGER NOT NULL REFERENCES web3_networks(id),
  coin_id           INTEGER REFERENCES coins(id),
  contract_address  TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  name              TEXT NOT NULL,
  decimals          INTEGER NOT NULL DEFAULT 18,
  logo_url          TEXT,
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  coingecko_id      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network_id, contract_address)
);
CREATE INDEX IF NOT EXISTS web3_tokens_network_idx ON web3_tokens(network_id);
CREATE INDEX IF NOT EXISTS web3_tokens_symbol_idx  ON web3_tokens(symbol);

CREATE TABLE IF NOT EXISTS web3_swaps (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id      INTEGER NOT NULL REFERENCES web3_networks(id),
  from_token_id   INTEGER REFERENCES web3_tokens(id),
  to_token_id     INTEGER REFERENCES web3_tokens(id),
  from_amount     NUMERIC(28, 18) NOT NULL,
  to_amount       NUMERIC(28, 18) NOT NULL,
  price_impact    NUMERIC(8, 4),
  slippage_bps    INTEGER NOT NULL DEFAULT 50,
  tx_hash         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS web3_swaps_user_idx ON web3_swaps(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS web3_bridges (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_network_id INTEGER NOT NULL REFERENCES web3_networks(id),
  to_network_id   INTEGER NOT NULL REFERENCES web3_networks(id),
  token_id        INTEGER REFERENCES web3_tokens(id),
  amount          NUMERIC(28, 18) NOT NULL,
  from_tx_hash    TEXT,
  to_tx_hash      TEXT,
  bridge_provider TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS web3_bridges_user_idx ON web3_bridges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS web3_wallets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id  INTEGER NOT NULL REFERENCES web3_networks(id),
  address     TEXT NOT NULL,
  label       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, network_id, address)
);
CREATE INDEX IF NOT EXISTS web3_wallets_user_idx ON web3_wallets(user_id);

-- ── 38. miscellaneous ────────────────────────────────────────────────────────

-- Login activity log
CREATE TABLE IF NOT EXISTS login_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip          TEXT NOT NULL,
  user_agent  TEXT,
  country     TEXT,
  city        TEXT,
  success     BOOLEAN NOT NULL DEFAULT TRUE,
  fail_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_logs_user_idx   ON login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_logs_ip_idx     ON login_logs(ip, created_at DESC);

-- Referral tracking
CREATE TABLE IF NOT EXISTS referral_rewards (
  id            SERIAL PRIMARY KEY,
  referrer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  coin_id       INTEGER NOT NULL REFERENCES coins(id),
  amount        NUMERIC(28, 8) NOT NULL DEFAULT '0',
  status        TEXT NOT NULL DEFAULT 'pending',
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx ON referral_rewards(referrer_id);

-- Price alerts
CREATE TABLE IF NOT EXISTS price_alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id     INTEGER NOT NULL REFERENCES coins(id),
  direction   TEXT NOT NULL,
  price       NUMERIC(28, 8) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  triggered   BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON price_alerts(user_id, is_active);

-- VIP / fee tiers
CREATE TABLE IF NOT EXISTS fee_tiers (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  volume_30d_min   NUMERIC(28, 2) NOT NULL DEFAULT '0',
  maker_fee        NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  taker_fee        NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  withdraw_fee_pct NUMERIC(10, 6) NOT NULL DEFAULT '0.001',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TDS (30% India tax deducted at source)
CREATE TABLE IF NOT EXISTS tds_deductions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id    INTEGER REFERENCES trades(id),
  amount      NUMERIC(28, 8) NOT NULL,
  coin_id     INTEGER NOT NULL REFERENCES coins(id),
  fy          TEXT NOT NULL,
  quarter     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tds_deductions_user_idx ON tds_deductions(user_id, fy);

-- ── Seed data ────────────────────────────────────────────────────────────────
INSERT INTO fee_config (default_maker_fee, default_taker_fee, withdrawal_fee_percent)
SELECT '0.001', '0.001', '0.001'
WHERE NOT EXISTS (SELECT 1 FROM fee_config LIMIT 1);

INSERT INTO exchange_settings (key, value) VALUES
  ('maintenance_mode',       'false'),
  ('banner_strip_enabled',   'false'),
  ('banner_strip_message',   ''),
  ('banner_strip_kind',      'info'),
  ('banner_strip_cta_label', ''),
  ('banner_strip_cta_url',   ''),
  ('site_name',              'Zebvix'),
  ('support_email',          'support@zebvix.com'),
  ('trading_enabled',        'true'),
  ('spot_enabled',           'true'),
  ('futures_enabled',        'true'),
  ('options_enabled',        'true'),
  ('p2p_enabled',            'true'),
  ('kyc_required_withdraw',  'true'),
  ('min_withdraw_kyc_level', '1'),
  ('referral_reward_pct',    '0.20'),
  ('tds_rate_pct',           '0.01'),
  ('max_leverage',           '100'),
  ('default_leverage',       '10')
ON CONFLICT (key) DO NOTHING;
