-- Phase 5: Full futures trading engine — persisted orders + trades.
-- Apply: psql "$DATABASE_URL" -f lib/db/migrations/003_futures_orders_trades.sql

CREATE TABLE IF NOT EXISTS futures_orders (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id         INTEGER NOT NULL,
  pair_id         INTEGER NOT NULL,
  side            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'limit',
  price           NUMERIC(28,8),
  qty             NUMERIC(28,8) NOT NULL,
  filled_qty      NUMERIC(28,8) NOT NULL DEFAULT 0,
  avg_fill_price  NUMERIC(28,8) NOT NULL DEFAULT 0,
  leverage        INTEGER NOT NULL DEFAULT 10,
  margin_type     TEXT NOT NULL DEFAULT 'isolated',
  margin_locked   NUMERIC(28,8) NOT NULL DEFAULT 0,
  reduce_only     BOOLEAN NOT NULL DEFAULT FALSE,
  stop_loss       NUMERIC(28,8),
  take_profit     NUMERIC(28,8),
  status          TEXT NOT NULL DEFAULT 'OPEN',
  fee             NUMERIC(28,8) NOT NULL DEFAULT 0,
  position_id     INTEGER,
  is_bot          INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS futures_orders_pair_status_idx  ON futures_orders (pair_id, status);
CREATE INDEX IF NOT EXISTS futures_orders_user_created_idx ON futures_orders (user_id, created_at);

CREATE TABLE IF NOT EXISTS futures_trades (
  id              SERIAL PRIMARY KEY,
  uid             VARCHAR(32) NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  pair_id         INTEGER NOT NULL,
  taker_order_id  INTEGER NOT NULL,
  maker_order_id  INTEGER NOT NULL,
  taker_user_id   INTEGER NOT NULL,
  maker_user_id   INTEGER NOT NULL,
  taker_side      TEXT NOT NULL,
  price           NUMERIC(28,8) NOT NULL,
  qty             NUMERIC(28,8) NOT NULL,
  taker_fee       NUMERIC(28,8) NOT NULL DEFAULT 0,
  maker_fee       NUMERIC(28,8) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS futures_trades_pair_created_idx  ON futures_trades (pair_id, created_at);
CREATE INDEX IF NOT EXISTS futures_trades_taker_user_idx    ON futures_trades (taker_user_id, created_at);
CREATE INDEX IF NOT EXISTS futures_trades_maker_user_idx    ON futures_trades (maker_user_id, created_at);
