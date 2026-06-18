-- Phase 4: Single-verified-bank rule. Enforce at DB level so concurrent verifies cannot create two verified rows for one user.
-- Apply to live DB:  psql "$DATABASE_URL" -f lib/db/migrations/001_bank_accounts_unique_verified.sql
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_one_verified_per_user
  ON bank_accounts (user_id)
  WHERE status = 'verified';
