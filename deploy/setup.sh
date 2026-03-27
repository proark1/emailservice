#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# MailNowAPI VPS Setup Script
# Run on a fresh Ubuntu 24.04 server (e.g., Hetzner CX22)
# Usage: sudo bash setup.sh yourdomain.com mail.yourdomain.com
# ============================================================

DOMAIN="${1:?Usage: sudo bash setup.sh DOMAIN MAIL_HOSTNAME}"
MAIL_HOSTNAME="${2:?Usage: sudo bash setup.sh DOMAIN MAIL_HOSTNAME}"

echo "==> Setting up MailNowAPI on $DOMAIN (mail host: $MAIL_HOSTNAME)"

# --- System updates ---
echo "==> Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# --- Set hostname ---
hostnamectl set-hostname "$MAIL_HOSTNAME"
echo "$MAIL_HOSTNAME" > /etc/hostname

# --- Install Docker ---
echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# --- Install Docker Compose plugin ---
if ! docker compose version &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi

# --- Install Caddy ---
echo "==> Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi

# --- Install Postfix ---
echo "==> Installing Postfix..."
export DEBIAN_FRONTEND=noninteractive
debconf-set-selections <<< "postfix postfix/mailname string $MAIL_HOSTNAME"
debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"
apt-get install -y -qq postfix

# --- Configure Postfix ---
echo "==> Configuring Postfix..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/postfix/main.cf" /etc/postfix/main.cf
cp "$SCRIPT_DIR/postfix/master.cf" /etc/postfix/master.cf

# Replace placeholders
sed -i "s/MAIL_HOSTNAME/$MAIL_HOSTNAME/g" /etc/postfix/main.cf
sed -i "s/DOMAIN/$DOMAIN/g" /etc/postfix/main.cf

systemctl restart postfix
systemctl enable postfix

# --- Configure Caddy ---
echo "==> Configuring Caddy..."
mkdir -p /var/log/caddy
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
# Replace {$DOMAIN} placeholder first (before the generic $DOMAIN replacement)
sed -i "s/{\\\$DOMAIN}/$DOMAIN/g" /etc/caddy/Caddyfile
sed -i "s/\$DOMAIN/$DOMAIN/g" /etc/caddy/Caddyfile

systemctl restart caddy
systemctl enable caddy

# --- Firewall ---
echo "==> Configuring firewall..."
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp   # SSH
    ufw allow 25/tcp   # SMTP (Postfix)
    ufw allow 80/tcp   # HTTP (Caddy ACME)
    ufw allow 443/tcp  # HTTPS (Caddy)
    ufw allow 587/tcp  # SMTP relay (app)
    ufw allow 465/tcp  # SMTPS relay (app)
    ufw --force enable
fi

# --- Create .env if not exists ---
if [ ! -f "$SCRIPT_DIR/../.env" ]; then
    echo "==> Creating .env from template..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    JWT_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)

    cat > "$SCRIPT_DIR/../.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://emailservice:${POSTGRES_PASSWORD}@postgres:5432/emailservice
REDIS_URL=redis://redis:6379
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_SECRET=${JWT_SECRET}
BASE_URL=https://${DOMAIN}
TRACKING_URL=https://${DOMAIN}
MAIL_HOST=${MAIL_HOSTNAME}

# Outbound: send via local Postfix
SMTP_HOST=host.docker.internal
SMTP_PORT=25

# SMTP relay TLS certs (optional — generate with scripts/generate-certs.ts)
# SMTP_TLS_KEY=./certs/key.pem
# SMTP_TLS_CERT=./certs/cert.pem

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF
    echo "==> .env created. Review and adjust before starting."
else
    echo "==> .env already exists, skipping."
fi

# --- Setup domain sync cron ---
echo "==> Setting up automatic domain sync for Postfix..."
SYNC_SCRIPT="$SCRIPT_DIR/sync-domains.sh"
chmod +x "$SYNC_SCRIPT"

# Switch Postfix to use hash file for virtual domains
touch /etc/postfix/virtual_domains
postmap /etc/postfix/virtual_domains
postconf -e "virtual_mailbox_domains = hash:/etc/postfix/virtual_domains"
systemctl restart postfix

# Install cron job (every minute)
CRON_LINE="* * * * * /opt/emailservice/deploy/sync-domains.sh >> /var/log/domain-sync.log 2>&1"
(crontab -l 2>/dev/null | grep -v "sync-domains.sh"; echo "$CRON_LINE") | crontab -

echo "==> Domain sync cron installed (runs every minute)"

echo ""
echo "============================================================"
echo "  Setup complete!"
echo "============================================================"
echo ""
echo "  Next steps:"
echo "  1. Review .env file:  nano $(dirname "$SCRIPT_DIR")/.env"
echo "  2. Set up DNS records (see deploy/README.md)"
echo "  3. Set PTR record in Hetzner panel → $MAIL_HOSTNAME"
echo "  4. Start the app:"
echo "     cd $(dirname "$SCRIPT_DIR")"
echo "     docker compose -f deploy/docker-compose.prod.yml up -d --build"
echo ""
echo "  5. Verify:"
echo "     curl https://$DOMAIN/health"
echo "     # Send test email via API"
echo ""
echo "  Ports open: 22 (SSH), 25 (SMTP), 80 (HTTP), 443 (HTTPS), 587, 465"
echo "============================================================"
