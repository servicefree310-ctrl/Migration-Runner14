-- Add is_taker flag to trades table.
-- Each matched trade creates exactly 2 rows (taker + maker).
-- This flag lets us show exactly 1 row per match in the admin trade tape
-- regardless of whether the counterparty is a bot or another real user.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_taker integer NOT NULL DEFAULT 0;

-- Back-fill: for existing rows we can't know which side was taker,
-- so leave them at 0. The admin trades filter uses is_taker=1 for new
-- trades; existing rows will still appear via the legacy bot-filter path.
