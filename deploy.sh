#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Nirmal Connect — VPS Deploy Script
# Usage: bash deploy.sh
# Run from: /home/ctrnirmalconnect/htdocs/www.ctrnirmalconnect.com
# ─────────────────────────────────────────────────────────────

set -e

DEPLOY_DIR="/home/ctrnirmalconnect/htdocs/www.ctrnirmalconnect.com"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Nirmal Connect — Deploying...          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

cd "$DEPLOY_DIR"

# ── 1. Pull latest changes ────────────────────────
echo "▶ Pulling latest changes..."
git pull origin dev

# ── 2. Install dependencies ───────────────────────
echo "▶ Installing dependencies..."
pnpm install --frozen-lockfile --ignore-scripts

# ── 3. Build shared packages ──────────────────────
echo "▶ Building shared packages..."
pnpm --filter @workspace/db run build 2>/dev/null || true
pnpm --filter @workspace/api-zod run build 2>/dev/null || true
pnpm --filter @workspace/api-client-react run build 2>/dev/null || true

# ── 4. Build API server ───────────────────────────
echo "▶ Building API server..."
pnpm --filter @workspace/api-server run build

# ── 5. Build frontend ─────────────────────────────
echo "▶ Building frontend..."
pnpm --filter @workspace/nirmal-connect run build

# ── 6. Run DB migrations ──────────────────────────
echo "▶ Running database migrations..."
pnpm --filter @workspace/db run migrate 2>/dev/null || true

# ── 7. Create logs directory ──────────────────────
mkdir -p "$DEPLOY_DIR/logs"

# ── 8. Restart PM2 process ────────────────────────
echo "▶ Restarting services..."
if pm2 list | grep -q "nirmal-connect-api"; then
  pm2 restart nirmal-connect-api
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo ""
echo "✅ Deployment complete!"
echo "   App running on port 5005"
echo "   Site: https://www.ctrnirmalconnect.com"
echo ""
