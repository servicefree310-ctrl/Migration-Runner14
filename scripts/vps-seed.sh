#!/usr/bin/env bash
# ============================================================================
# vps-seed.sh — Run all seeds on a VPS after vps-migrate.sh
#
# Usage:
#   export DATABASE_URL="postgresql://user:pass@localhost:5432/zebvix"
#   bash scripts/vps-seed.sh
# ============================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# Auto-load .env if DATABASE_URL not already set
if [ -z "$DATABASE_URL" ]; then
  ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
  if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | grep '=' | xargs)
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

echo ""
echo "============================================================"
echo " Zebvix — VPS Database Seed"
echo " Target: $DATABASE_URL"
echo "============================================================"
echo ""

cd "$ROOT_DIR"

echo -e "${CYAN}Running: seed:all (coins → admin → kyc → ai-plans → earn → bots → ai-accounts)${NC}"
echo ""

pnpm --filter @workspace/scripts run seed:all

echo ""
echo -e "${GREEN}============================================================"
echo " ✅ All seeds complete!"
echo ""
echo " Default credentials:"
echo "   Admin   → admin@zebvix.com  /  Admin1234!"
echo "   AI bots → *@aitrader.bot    /  AiTrader2025!"
echo ""
echo " Next: start the services"
echo "   PM2: pm2 start ecosystem.config.js"
echo -e "============================================================${NC}"
echo ""
