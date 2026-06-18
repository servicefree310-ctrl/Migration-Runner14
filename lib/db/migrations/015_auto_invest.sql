-- 015: Auto-invest accounts + trades tables
-- Safe to re-run — uses IF NOT EXISTS throughout

CREATE TABLE IF NOT EXISTS "auto_invest_accounts" (
  "id"               serial PRIMARY KEY,
  "user_id"          integer NOT NULL UNIQUE,
  "balance"          numeric(28, 8) NOT NULL DEFAULT '0',
  "total_deposited"  numeric(28, 8) NOT NULL DEFAULT '0',
  "total_withdrawn"  numeric(28, 8) NOT NULL DEFAULT '0',
  "total_earned"     numeric(28, 8) NOT NULL DEFAULT '0',
  "daily_rate_pct"   numeric(6, 4)  NOT NULL DEFAULT '0.75',
  "status"           text           NOT NULL DEFAULT 'active',
  "created_at"       timestamptz    NOT NULL DEFAULT now(),
  "updated_at"       timestamptz    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "auto_invest_trades" (
  "id"           serial PRIMARY KEY,
  "account_id"   integer NOT NULL,
  "user_id"      integer NOT NULL,
  "pair"         text    NOT NULL,
  "side"         text    NOT NULL,
  "entry_price"  numeric(28, 8) NOT NULL,
  "exit_price"   numeric(28, 8) NOT NULL,
  "amount_usdt"  numeric(28, 8) NOT NULL,
  "pnl_usdt"     numeric(28, 8) NOT NULL,
  "pnl_pct"      numeric(10, 6) NOT NULL,
  "is_win"       boolean        NOT NULL DEFAULT true,
  "strategy"     text           NOT NULL DEFAULT '',
  "opened_at"    timestamptz    NOT NULL DEFAULT now(),
  "closed_at"    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auto_invest_accounts_user_idx"  ON "auto_invest_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "auto_invest_trades_account_idx" ON "auto_invest_trades"   ("account_id");
CREATE INDEX IF NOT EXISTS "auto_invest_trades_user_idx"    ON "auto_invest_trades"   ("user_id");
CREATE INDEX IF NOT EXISTS "auto_invest_trades_time_idx"    ON "auto_invest_trades"   ("opened_at");
