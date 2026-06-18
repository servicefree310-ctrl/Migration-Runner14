-- Premium user-portal upgrade: notifications + price alerts, trading bots,
-- copy trading, customizable dashboards + watchlists. All idempotent so
-- the migration is safe to apply on environments where drizzle-kit push
-- has already created some/all of these objects.

-- ─── Notifications + price alerts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'system',
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  cta_label     TEXT,
  cta_url       TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_notif_user_created_idx ON user_notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS user_notif_user_unread_idx  ON user_notifications (user_id, read_at);

CREATE TABLE IF NOT EXISTS price_alerts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  coin_symbol     TEXT NOT NULL,
  condition       TEXT NOT NULL,
  target_price    NUMERIC(28,8) NOT NULL,
  trigger_once    BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'active',
  triggered_at    TIMESTAMPTZ,
  triggered_price NUMERIC(28,8),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS price_alerts_user_status_idx   ON price_alerts (user_id, status);
CREATE INDEX IF NOT EXISTS price_alerts_symbol_status_idx ON price_alerts (coin_symbol, status);

-- ─── Trading bots ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_bots (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  name                TEXT NOT NULL,
  bot_type            TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  base_symbol         TEXT NOT NULL,
  quote_symbol        TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'stopped',
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_invested_usd  NUMERIC(28,8) NOT NULL DEFAULT 0,
  realized_pnl_usd    NUMERIC(28,8) NOT NULL DEFAULT 0,
  unrealized_pnl_usd  NUMERIC(28,8) NOT NULL DEFAULT 0,
  total_trades        INTEGER NOT NULL DEFAULT 0,
  successful_trades   INTEGER NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ,
  stopped_at          TIMESTAMPTZ,
  last_run_at         TIMESTAMPTZ,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bots_user_status_idx ON trading_bots (user_id, status);
CREATE INDEX IF NOT EXISTS bots_status_idx      ON trading_bots (status);

CREATE TABLE IF NOT EXISTS bot_trades (
  id          SERIAL PRIMARY KEY,
  bot_id      INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  side        TEXT NOT NULL,
  price       NUMERIC(28,8) NOT NULL,
  qty         NUMERIC(28,8) NOT NULL,
  notional    NUMERIC(28,8) NOT NULL,
  pnl_usd     NUMERIC(28,8) NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_trades_bot_idx ON bot_trades (bot_id, created_at);

-- ─── Copy trading ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trader_profiles (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  bio                   TEXT NOT NULL DEFAULT '',
  avatar_url            TEXT,
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  performance_fee_bps   INTEGER NOT NULL DEFAULT 1000,
  total_pnl_usd         NUMERIC(28,8) NOT NULL DEFAULT 0,
  pnl_30d_pct           NUMERIC(12,4) NOT NULL DEFAULT 0,
  pnl_90d_pct           NUMERIC(12,4) NOT NULL DEFAULT 0,
  win_rate_pct          NUMERIC(6,2)  NOT NULL DEFAULT 0,
  total_trades          INTEGER NOT NULL DEFAULT 0,
  followers_count       INTEGER NOT NULL DEFAULT 0,
  aum_usd               NUMERIC(28,8) NOT NULL DEFAULT 0,
  risk_score            INTEGER NOT NULL DEFAULT 50,
  tags                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trader_profiles_active_pnl_idx ON trader_profiles (is_active, pnl_30d_pct);

CREATE TABLE IF NOT EXISTS copy_relations (
  id                       SERIAL PRIMARY KEY,
  follower_id              INTEGER NOT NULL,
  trader_id                INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active',
  allocation_usd           NUMERIC(28,8) NOT NULL,
  copy_ratio               NUMERIC(8,4)  NOT NULL DEFAULT 1,
  max_risk_per_trade_pct   NUMERIC(6,2)  NOT NULL DEFAULT 5,
  total_copied_trades      INTEGER NOT NULL DEFAULT 0,
  total_pnl_usd            NUMERIC(28,8) NOT NULL DEFAULT 0,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at               TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS copy_rel_follower_trader_idx ON copy_relations (follower_id, trader_id);
CREATE INDEX        IF NOT EXISTS copy_rel_trader_status_idx   ON copy_relations (trader_id, status);

-- ─── Pro Dashboard layouts + watchlists ──────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Default',
  is_default  INTEGER NOT NULL DEFAULT 0,
  layout      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_layouts_user_name_idx ON dashboard_layouts (user_id, name);

CREATE TABLE IF NOT EXISTS watchlists (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT 'My Watchlist',
  symbols     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS watchlists_user_name_idx ON watchlists (user_id, name);
