#!/usr/bin/env bash
# ============================================================
# Sync verified receive-enabled domains from DB to Postfix
# Runs via cron every minute. Only reloads Postfix if changed.
# ============================================================

set -euo pipefail

DOMAINS_FILE="/etc/postfix/virtual_domains"
COMPOSE_FILE="/opt/emailservice/deploy/docker-compose.prod.yml"
TEMP_FILE=$(mktemp)

# Query verified domains that accept inbound email
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U emailservice -t -A -c \
  "SELECT name FROM domains WHERE status = 'verified' AND mode IN ('receive', 'both')" \
  2>/dev/null | sort > "$TEMP_FILE"

# Also add mailnowapi.com as a base domain (always accept)
echo "mailnowapi.com" >> "$TEMP_FILE"
sort -u -o "$TEMP_FILE" "$TEMP_FILE"

# Format for Postfix virtual_mailbox_domains (domain OK)
POSTFIX_TEMP=$(mktemp)
while IFS= read -r domain; do
  [ -n "$domain" ] && echo "$domain OK"
done < "$TEMP_FILE" > "$POSTFIX_TEMP"

# Only update if changed
if [ ! -f "$DOMAINS_FILE" ] || ! diff -q "$POSTFIX_TEMP" "$DOMAINS_FILE" > /dev/null 2>&1; then
  cp "$POSTFIX_TEMP" "$DOMAINS_FILE"
  postmap "$DOMAINS_FILE"
  postfix reload > /dev/null 2>&1
  echo "$(date '+%Y-%m-%d %H:%M:%S') Synced $(wc -l < "$TEMP_FILE") domains to Postfix"
fi

rm -f "$TEMP_FILE" "$POSTFIX_TEMP"
