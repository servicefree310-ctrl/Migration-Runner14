-- Instant Convert: 10-second-locked quotes the user can execute atomically.
-- Idempotent (CREATE … IF NOT EXISTS) so safe to re-apply on environments
-- where the table was previously created via `drizzle push`.

CREATE TABLE IF NOT EXISTS convert_quotes (
  id            SERIAL PRIMARY KEY,
  uid           VARCHAR(32) NOT NULL UNIQUE
                  DEFAULT replace(gen_random_uuid()::text, '-', ''),
  user_id       INTEGER NOT NULL,
  from_coin_id  INTEGER NOT NULL,
  to_coin_id    INTEGER NOT NULL,
  from_amount   NUMERIC(28, 8) NOT NULL,
  to_amount     NUMERIC(28, 8) NOT NULL,
  rate          NUMERIC(28, 8) NOT NULL,
  fee_amount    NUMERIC(28, 8) NOT NULL DEFAULT 0,
  fee_bps       INTEGER NOT NULL DEFAULT 0,
  vip_tier      INTEGER NOT NULL DEFAULT 0,
  -- pending → executed | expired | cancelled
  status        TEXT NOT NULL DEFAULT 'pending',
  expires_at    TIMESTAMPTZ NOT NULL,
  executed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS convert_quotes_user_idx
  ON convert_quotes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS convert_quotes_status_idx
  ON convert_quotes (status);
