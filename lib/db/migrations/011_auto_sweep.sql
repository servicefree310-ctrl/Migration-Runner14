-- Auto-sweep: deposit address → hot/master wallet
ALTER TABLE networks
  ADD COLUMN IF NOT EXISTS auto_sweep_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE crypto_deposits
  ADD COLUMN IF NOT EXISTS sweep_status text,
  ADD COLUMN IF NOT EXISTS sweep_tx_hash text,
  ADD COLUMN IF NOT EXISTS swept_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_sweep
  ON crypto_deposits(sweep_status)
  WHERE sweep_status IS NOT NULL;
