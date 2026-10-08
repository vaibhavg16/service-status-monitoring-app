#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
URL="${1:?Usage: ./set-webhook.sh https://your-tunnel.trycloudflare.com}"
URL="${URL%/}"
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' .env | cut -d= -f2-)

curl -s "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -d "url=$URL/api/telegram/webhook" \
  -d "secret_token=$SECRET" \
  -d 'allowed_updates=["message","callback_query"]' \
  -d "drop_pending_updates=true"
echo
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo" | python3 -m json.tool
