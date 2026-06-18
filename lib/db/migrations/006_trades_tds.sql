-- Track per-fill TDS on the trades table so accounting/reports can show the
-- exact tax deducted on each spot sell. Mirrors the existing `fee` column
-- in shape and default; only the seller-side row will ever be non-zero.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tds NUMERIC(28,8) NOT NULL DEFAULT 0;
