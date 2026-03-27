#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MailNowAPI — Deploy / Update Script
# Run from the project root on the server
# Usage: bash deploy/deploy.sh
# ============================================================

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo "==> Rebuilding Docker images..."
docker compose -f deploy/docker-compose.prod.yml build

echo "==> Restarting services (zero-downtime)..."
docker compose -f deploy/docker-compose.prod.yml up -d --remove-orphans

echo "==> Waiting for health check..."
sleep 5
for i in 1 2 3 4 5 6; do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "==> Health check passed!"
    break
  fi
  if [ "$i" -eq 6 ]; then
    echo "==> WARNING: Health check failed after 30s"
    echo "    Check logs: docker compose -f deploy/docker-compose.prod.yml logs app --tail 50"
    exit 1
  fi
  echo "    Attempt $i/6 - waiting..."
  sleep 5
done

echo "==> Cleaning up old images..."
docker image prune -f

echo "==> Deploy complete!"
echo "    App:    $(curl -sf http://localhost:3000/health | head -c 100)"
