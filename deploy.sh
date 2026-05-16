#!/bin/bash
# ─────────────────────────────────────────────────────────────
# People Connect — VPS Deploy Script
# Usage: bash deploy.sh
# Run this from: /home/tamilagavetrikalagam/htdocs/tkprabhu.tamilagavetrikalagam.com
# ─────────────────────────────────────────────────────────────

set -e

DEPLOY_DIR="/home/tamilagavetrikalagam/htdocs/tkprabhu.tamilagavetrikalagam.com"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       People Connect — Deploying...          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

cd "$DEPLOY_DIR"

# ── 1. Pull latest changes ────────────────────────
echo "▶ Pulling latest changes..."
git pull origin main

# ── 2. Install dependencies ───────────────────────
echo "▶ Installing dependencies..."
pnpm install --frozen-lockfile

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

# ── 7. Restart PM2 processes ──────────────────────
echo "▶ Restarting services..."
if pm2 list | grep -q "people-connect-api"; then
  pm2 restart people-connect-api
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo ""
echo "✅ Deployment complete!"
echo "   API:      http://localhost:8080"
echo "   Frontend: served via Nginx from dist/"
echo ""
