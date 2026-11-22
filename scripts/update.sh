#!/usr/bin/env bash
# Cập nhật bản chạy thật sau khi có code mới: bash scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
set -a; . ./.env; set +a
pnpm db:deploy

if pm2 describe sugami-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
pm2 status
