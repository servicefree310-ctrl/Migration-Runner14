#!/usr/bin/env bash
# ============================================================================
# vps-migrate.sh — Full database migration runner for fresh VPS PostgreSQL
#
# Usage:
#   export DATABASE_URL="postgresql://user:pass@localhost:5432/zebvix"
#   bash scripts/vps-migrate.sh
#
# Order:
#   1. Drizzle base schema     (lib/db/drizzle/0000 → 0003)
#   2. Incremental migrations  (lib/db/migrations/001 → 014)
#
# All SQL is idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
# Drizzle --> statement-breakpoint markers are stripped automatically.
# ============================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Auto-load .env if DATABASE_URL not already set
if [ -z "$DATABASE_URL" ]; then
  ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
  if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      [[ -z "$line" || "$line" == \#* ]] && continue
      [[ "$line" != *=* ]] && continue
      key="${line%%=*}"
      val="${line#*=}"
      [[ -z "$key" ]] && continue
      export "$key=$val"
    done < "$ENV_FILE"
    echo "   Loaded .env from $ENV_FILE"
  fi
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL is not set.${NC}"
  echo "   Export it before running: export DATABASE_URL='postgresql://user:pass@host/db'"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

run_sql_file() {
  local label="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}   ⚠  Skipping (not found): $file${NC}"
    return
  fi

  echo -e "   → Running: ${label}"

  # Strip drizzle -->statement-breakpoint markers, then pipe to psql
  sed 's/--> statement-breakpoint//g' "$file" | \
    psql "$DATABASE_URL" --quiet --set ON_ERROR_STOP=1 2>&1

  if [ $? -eq 0 ]; then
    echo -e "      ${GREEN}✓ done${NC}"
  else
    echo -e "      ${RED}✗ FAILED${NC}"
    exit 1
  fi
}

run_sql_statement() {
  local label="$1"
  local sql="$2"
  echo -e "   → ${label}"
  echo "$sql" | psql "$DATABASE_URL" --quiet --set ON_ERROR_STOP=1 2>&1
  echo -e "      ${GREEN}✓ done${NC}"
}

echo ""
echo "============================================================"
echo " Zebvix — Full Database Migration"
echo " Target: $DATABASE_URL"
echo "============================================================"
echo ""

# ── Phase 1: Drizzle base schema ─────────────────────────────────────────────
echo -e "${YELLOW}[Phase 1] Drizzle base schema${NC}"

# 0000 — Full base schema (all tables, enums, indexes)
run_sql_file "0000 — base schema (all tables + enums)" \
  "$ROOT_DIR/lib/db/drizzle/0000_light_maddog.sql"

# 0001 — Additional indexes
run_sql_file "0001 — additional indexes" \
  "$ROOT_DIR/lib/db/drizzle/0001_soft_anthem.sql"

# 0002 — New tables + enum value additions (ADD VALUE cannot run in a transaction;
#         run each ALTER TYPE first, then the rest)
echo "   → 0002 — new tables + enum additions"
MIGRATION_0002="$ROOT_DIR/lib/db/drizzle/0002_natural_vengeance.sql"
if [ -f "$MIGRATION_0002" ]; then
  # Extract and run ALTER TYPE ADD VALUE lines first (outside transaction)
  grep "ALTER TYPE.*ADD VALUE" "$MIGRATION_0002" | \
    sed 's/--> statement-breakpoint//g' | \
    while IFS= read -r line; do
      echo "$line;" | psql "$DATABASE_URL" --quiet 2>/dev/null || true
    done

  # Run the rest (excluding ALTER TYPE ADD VALUE lines)
  grep -v "ALTER TYPE.*ADD VALUE" "$MIGRATION_0002" | \
    sed 's/--> statement-breakpoint//g' | \
    psql "$DATABASE_URL" --quiet --set ON_ERROR_STOP=1 2>&1
  echo -e "      ${GREEN}✓ done${NC}"
fi

# 0003 — Referrals alter
run_sql_file "0003 — referrals source_ref column" \
  "$ROOT_DIR/lib/db/drizzle/0003_romantic_warbound.sql"

echo ""

# ── Phase 2: Incremental migrations ──────────────────────────────────────────
echo -e "${YELLOW}[Phase 2] Incremental migrations (001 → 014)${NC}"

run_sql_file "001 — bank_accounts unique verified constraint" \
  "$ROOT_DIR/lib/db/migrations/001_bank_accounts_unique_verified.sql"

run_sql_file "002 — otp_codes table" \
  "$ROOT_DIR/lib/db/migrations/002_otp_codes.sql"

run_sql_file "003 — futures_orders + futures_trades tables" \
  "$ROOT_DIR/lib/db/migrations/003_futures_orders_trades.sql"

run_sql_file "004 — CMS tables (announcements, news, competitions)" \
  "$ROOT_DIR/lib/db/migrations/004_cms.sql"

run_sql_file "005 — login OTP preferences columns" \
  "$ROOT_DIR/lib/db/migrations/005_login_otp_prefs.sql"

run_sql_file "006 — trades TDS column" \
  "$ROOT_DIR/lib/db/migrations/006_trades_tds.sql"

run_sql_file "007 — premium portal tables (bots, copy trading, dashboards)" \
  "$ROOT_DIR/lib/db/migrations/007_premium_user_portal.sql"

run_sql_file "008 — P2P escrow + disputes" \
  "$ROOT_DIR/lib/db/migrations/008_p2p_escrow_and_disputes.sql"

run_sql_file "009 — convert quotes table" \
  "$ROOT_DIR/lib/db/migrations/009_convert_quotes.sql"

run_sql_file "010 — trades is_taker column" \
  "$ROOT_DIR/lib/db/migrations/010_trades_is_taker.sql"

run_sql_file "011 — auto-sweep columns" \
  "$ROOT_DIR/lib/db/migrations/011_auto_sweep.sql"

run_sql_file "012 — instruments + broker tables" \
  "$ROOT_DIR/lib/db/migrations/012_instruments.sql"

run_sql_file "013 — broker accounts system" \
  "$ROOT_DIR/lib/db/migrations/013_broker_accounts.sql"

run_sql_file "014 — coins/networks/pairs performance indexes" \
  "$ROOT_DIR/lib/db/migrations/014_coins_networks_pairs.sql"

echo ""
echo -e "${GREEN}============================================================"
echo " ✅ All migrations complete!"
echo " Next: run the seed scripts to populate initial data."
echo "   bash scripts/vps-seed.sh"
echo -e "============================================================${NC}"
echo ""
