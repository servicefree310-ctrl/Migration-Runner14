-- Migration 013: Angel One Sub-broker Account System
-- broker_accounts: per-user Angel One account application + status
CREATE TABLE IF NOT EXISTS broker_accounts (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  angel_client_id     TEXT,
  angel_demat         TEXT,
  angel_trading_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  rejection_reason    TEXT,
  full_name           TEXT,
  dob                 TEXT,
  gender              TEXT,
  father_name         TEXT,
  mother_name         TEXT,
  marital_status      TEXT,
  annual_income       TEXT,
  occupation          TEXT,
  mobile              TEXT,
  email               TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  pincode             TEXT,
  pan_number          TEXT,
  aadhar_number       TEXT,
  bank_account_no     TEXT,
  bank_ifsc           TEXT,
  bank_name           TEXT,
  bank_account_type   TEXT DEFAULT 'savings',
  segment_equity      BOOLEAN DEFAULT TRUE,
  segment_fno         BOOLEAN DEFAULT FALSE,
  segment_commodity   BOOLEAN DEFAULT FALSE,
  segment_currency    BOOLEAN DEFAULT FALSE,
  nominee_name        TEXT,
  nominee_relation    TEXT,
  nominee_dob         TEXT,
  jwt_token           TEXT,
  jwt_expires_at      TIMESTAMPTZ,
  refresh_token       TEXT,
  feed_token          TEXT,
  submitted_at        TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS broker_accounts_user_id_idx ON broker_accounts(user_id);

-- broker_kyc_docs: uploaded KYC documents per application
CREATE TABLE IF NOT EXISTS broker_kyc_docs (
  id                  SERIAL PRIMARY KEY,
  broker_account_id   INTEGER NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  doc_type            TEXT NOT NULL,
  file_url            TEXT,
  file_key            TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  rejection_note      TEXT,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at         TIMESTAMPTZ
);

-- broker_orders: stock/forex/commodity orders placed via AP
CREATE TABLE IF NOT EXISTS broker_orders (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_account_id   INTEGER REFERENCES broker_accounts(id),
  symbol              TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  asset_class         TEXT NOT NULL,
  order_type          TEXT NOT NULL DEFAULT 'market',
  side                TEXT NOT NULL,
  qty                 NUMERIC(18,4) NOT NULL,
  price               NUMERIC(18,6),
  trigger_price       NUMERIC(18,6),
  status              TEXT NOT NULL DEFAULT 'pending',
  angel_order_id      TEXT,
  executed_qty        NUMERIC(18,4) DEFAULT 0,
  executed_price      NUMERIC(18,6),
  pnl                 NUMERIC(18,6),
  brokerage           NUMERIC(18,6),
  simulated           BOOLEAN NOT NULL DEFAULT TRUE,
  error_msg           TEXT,
  placed_at           TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- broker_portfolio: current holdings per user
CREATE TABLE IF NOT EXISTS broker_portfolio (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_account_id   INTEGER REFERENCES broker_accounts(id),
  symbol              TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  asset_class         TEXT NOT NULL,
  holding_qty         NUMERIC(18,4) NOT NULL DEFAULT 0,
  avg_buy_price       NUMERIC(18,6) NOT NULL DEFAULT 0,
  current_price       NUMERIC(18,6),
  unrealized_pnl      NUMERIC(18,6),
  realized_pnl        NUMERIC(18,6) DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol, exchange)
);
