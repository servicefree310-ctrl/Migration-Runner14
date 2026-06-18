#!/usr/bin/env bash
# ============================================================================
# vps-setup.sh — Complete Zebvix VPS Deployment Script
#
# Tested on: Ubuntu 22.04 / Debian 12
#
# What it does:
#   1. Installs Node.js 22 (via nvm), pnpm, PostgreSQL
#   2. Creates database + user
#   3. Clones / copies the repo (if needed)
#   4. Installs npm dependencies
#   5. Runs all migrations
#   6. Runs all seeds
#   7. Builds the API server
#   8. Installs PM2 and starts all services
#
# Usage (on fresh VPS):
#   git clone <your-repo> /opt/zebvix
#   cd /opt/zebvix
#   export ZEBVIX_DB_PASSWORD="YourSecurePassword123!"
#   bash scripts/vps-setup.sh
#
# Environment variables (all optional — have defaults):
#   ZEBVIX_DB_NAME      — DB name (default: zebvix)
#   ZEBVIX_DB_USER      — DB user (default: zebvix)
#   ZEBVIX_DB_PASSWORD  — DB password (REQUIRED or will prompt)
#   ZEBVIX_DB_HOST      — DB host (default: localhost)
#   ZEBVIX_DB_PORT      — DB port (default: 5432)
#   SESSION_SECRET      — JWT/session secret (default: auto-generated)
#   NODE_ENV            — Node environment (default: production)
# ============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${CYAN}[$(date +%T)]${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗ FAILED:${NC} $*"; exit 1; }
section(){ echo ""; echo -e "${BOLD}${CYAN}━━━━ $* ━━━━${NC}"; echo ""; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ───────────────────────────────────────────────────────────────────
DB_NAME="${ZEBVIX_DB_NAME:-zebvix}"
DB_USER="${ZEBVIX_DB_USER:-zebvix}"
DB_HOST="${ZEBVIX_DB_HOST:-localhost}"
DB_PORT="${ZEBVIX_DB_PORT:-5432}"
NODE_ENV="${NODE_ENV:-production}"

if [ -z "${ZEBVIX_DB_PASSWORD:-}" ]; then
  echo -n "Enter PostgreSQL password for user '$DB_USER': "
  read -rs DB_PASSWORD
  echo ""
else
  DB_PASSWORD="$ZEBVIX_DB_PASSWORD"
fi

SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e " ${BOLD}Zebvix — Full VPS Setup${NC}"
echo " DB: postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo " Node env: ${NODE_ENV}"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── 1. System packages ───────────────────────────────────────────────────────
section "Step 1/8 — System packages"
if command -v apt-get &>/dev/null; then
  log "Updating apt and installing dependencies…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    curl wget git build-essential libssl-dev \
    postgresql postgresql-contrib \
    nginx certbot python3-certbot-nginx
  ok "System packages installed"
else
  warn "Not Ubuntu/Debian — skipping apt-get. Install Node.js, PostgreSQL manually."
fi

# ── 2. Node.js (via nvm) ─────────────────────────────────────────────────────
section "Step 2/8 — Node.js 22 + pnpm"
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  log "Installing nvm…"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
nvm install 22 --no-progress
nvm use 22
nvm alias default 22
ok "Node.js $(node -v) ready"

if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm…"
  npm install -g pnpm
fi
ok "pnpm $(pnpm -v) ready"

# ── 3. PostgreSQL setup ──────────────────────────────────────────────────────
section "Step 3/8 — PostgreSQL database"
log "Ensuring PostgreSQL is running…"
sudo systemctl enable postgresql --quiet
sudo systemctl start postgresql

log "Creating database user and database…"
sudo -u postgres psql --quiet <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;

SELECT 'Database exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')
UNION ALL
SELECT 'Creating database' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}');

CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}" ENCODING 'UTF8' TEMPLATE template0
  LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';

GRANT ALL PRIVILEGES ON DATABASE "${DB_NAME}" TO "${DB_USER}";
SQL
ok "Database '${DB_NAME}' ready with user '${DB_USER}'"

# ── 4. Install dependencies ──────────────────────────────────────────────────
section "Step 4/8 — Install Node dependencies"
log "Running pnpm install in $ROOT_DIR…"
cd "$ROOT_DIR"
pnpm install --frozen-lockfile
ok "Dependencies installed"

# ── 5. Environment file ──────────────────────────────────────────────────────
section "Step 5/8 — Environment configuration"
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating .env file…"
  cat > "$ENV_FILE" <<EOF
# Zebvix — Environment Configuration
# Generated by vps-setup.sh on $(date)

DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=${NODE_ENV}
PORT=8080

# Optional — add your keys below:
# RAZORPAY_KEY_ID=
# RAZORPAY_KEY_SECRET=
# SENDGRID_API_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# OPENAI_API_KEY=
# REDIS_URL=redis://localhost:6379
EOF
  ok ".env file created at $ENV_FILE"
else
  warn ".env already exists — skipping (update manually if needed)"
fi

# Load env
# shellcheck source=/dev/null
set -a; source "$ENV_FILE"; set +a

# ── 6. Database migrations ───────────────────────────────────────────────────
section "Step 6/8 — Database migrations"
log "Running vps-migrate.sh…"
bash "$SCRIPT_DIR/vps-migrate.sh"
ok "All migrations applied"

# ── 7. Database seed ─────────────────────────────────────────────────────────
section "Step 7/8 — Database seed"
log "Running vps-seed.sh (coins, admin, kyc, bots, earn, ai-plans)…"
bash "$SCRIPT_DIR/vps-seed.sh"
ok "All seeds complete"

# ── 8. Build API server ──────────────────────────────────────────────────────
section "Step 8/8 — Build & start services"
log "Building API server…"
cd "$ROOT_DIR"
pnpm --filter @workspace/api-server run build
ok "API server built"

# ── PM2 ──────────────────────────────────────────────────────────────────────
log "Installing PM2…"
npm install -g pm2 --quiet
ok "PM2 ready"

# Write PM2 ecosystem file
cat > "$ROOT_DIR/ecosystem.config.cjs" <<'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: "zebvix-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/opt/zebvix",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      env_file: ".env",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      max_memory_restart: "1G",
      restart_delay: 3000,
    }
  ]
};
ECOSYSTEM

mkdir -p "$ROOT_DIR/logs"

log "Starting API server with PM2…"
cd "$ROOT_DIR"
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true
ok "PM2 services started and saved"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo -e " ${GREEN}${BOLD}✅ Zebvix VPS Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  API Server:   http://$(hostname -I | awk '{print $1}'):8080/api/healthz"
echo "  Processes:    pm2 list"
echo "  Logs:         pm2 logs zebvix-api"
echo ""
echo "  DB:           $DATABASE_URL"
echo "  Admin login:  admin@zebvix.com  /  Admin1234!"
echo ""
echo "  Build admin panel:  PORT=23744 BASE_PATH=/admin/ pnpm --filter @workspace/admin run build"
echo "  Build user portal:  PORT=23475 BASE_PATH=/user/ pnpm --filter @workspace/user-portal run build"
echo ""
echo "  Nginx config: /etc/nginx/sites-available/zebvix"
echo "  (Configure manually to serve /admin/ and /user/ as static files)"
echo ""
echo "════════════════════════════════════════════════════════════"
