#!/bin/bash
# Push to main and trigger Render deploy
# Usage: ./deploy.sh

set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Not on main branch (currently on $BRANCH)"
  exit 1
fi

# Push
echo "[1/2] Pushing to origin/main..."
git push origin main

# Trigger Render deploy
ENV_FILE="$(git rev-parse --show-toplevel)/.env"
RENDER_KEY=$(grep '^RENDER_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
SERVICE_ID="srv-d757b9khg0os73aed5q0"

if [ -z "$RENDER_KEY" ]; then
  echo "[2/2] No RENDER_API_KEY in .env — skipping deploy trigger"
  exit 0
fi

echo "[2/2] Triggering Render deploy..."
RESULT=$(curl -s -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}')

STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
echo "[deploy] Status: $STATUS"
echo "[deploy] Dashboard: https://dashboard.render.com/web/$SERVICE_ID"
