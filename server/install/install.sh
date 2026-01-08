#!/usr/bin/env bash
set -euo pipefail

# Turnkey installer for teamdb systemd unit and nginx site
# Usage: sudo ./install.sh [--non-interactive] [--install-dir /opt/successfactors-chrome-addon] [--user planner] [--port 8765] [--domain _] [--location /teamdb/] [--site-name teamdb]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/.."
DEFAULT_INSTALL_DIR="$(realpath "$SCRIPT_DIR/../..")"
DEFAULT_USER="planner"
DEFAULT_PORT="8765"
DEFAULT_DOMAIN="_"
DEFAULT_LOCATION="/teamdb/"
DEFAULT_SITE_NAME="teamdb"
NONINTERACTIVE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --non-interactive) NONINTERACTIVE=1; shift ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --user) USERNAME="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) echo "Usage: $0 [--non-interactive] [--install-dir PATH] [--user USER] [--port PORT] [--domain DOMAIN] [--location URLPREFIX] [--site-name NAME]"; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
USERNAME="${USERNAME:-$DEFAULT_USER}"
PORT="${PORT:-$DEFAULT_PORT}"
DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
LOCATION="${LOCATION:-$DEFAULT_LOCATION}"
SITE_NAME="${SITE_NAME:-$DEFAULT_SITE_NAME}"
SERVICE_NAME="teamdb"

echo "Installer configuration:" 
echo "  INSTALL_DIR: $INSTALL_DIR"
echo "  USER: $USERNAME"
echo "  PORT: $PORT"
echo "  DOMAIN: $DOMAIN"
echo "  NGINX_LOCATION: $LOCATION"
echo "  NGINX_SITE_NAME: $SITE_NAME"

if [ "$NONINTERACTIVE" -eq 0 ]; then
  read -r -p "Proceed with these settings? [Y/n] " yn
  yn=${yn:-Y}
  if [[ ! "$yn" =~ ^[Yy] ]]; then
    echo "Aborted by user."; exit 1
  fi
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "This installer must be run as root (sudo)."; exit 1
fi

# Prepare systemd unit
SYSTEMD_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
BACKUP_DIR="/var/backups/teamdb-install-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f "$SYSTEMD_PATH" ]; then
  echo "Backing up existing systemd unit to $BACKUP_DIR/"
  cp -a "$SYSTEMD_PATH" "$BACKUP_DIR/"
fi

cat > "$SYSTEMD_PATH" <<EOF
[Unit]
Description=SuccessFactor backend service
After=network.target

[Service]
Type=simple
User=$USERNAME
WorkingDirectory=$INSTALL_DIR
Environment=TEAMDB_INSTALL_DIR=$INSTALL_DIR
ExecStart=$INSTALL_DIR/server/install/systemd_runner.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$SYSTEMD_PATH"
echo "Wrote systemd unit: $SYSTEMD_PATH"

# Prepare nginx site
NGINX_AVAILABLE="/etc/nginx/sites-available/$SITE_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$SITE_NAME"
if [ -f "$NGINX_AVAILABLE" ]; then
  echo "Backing up existing nginx site to $BACKUP_DIR/"
  cp -a "$NGINX_AVAILABLE" "$BACKUP_DIR/"
fi

cat > "$NGINX_AVAILABLE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location $LOCATION {
        proxy_pass http://127.0.0.1:$PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
echo "Wrote nginx site: $NGINX_AVAILABLE (enabled)"

# Test nginx config
if nginx -t; then
  systemctl reload nginx || echo "nginx reload failed (but config tested OK)"
else
  echo "nginx configuration test failed. Restoring backup and aborting."
  if [ -f "$BACKUP_DIR/$(basename "$NGINX_AVAILABLE")" ]; then
    cp -a "$BACKUP_DIR/$(basename "$NGINX_AVAILABLE")" "$NGINX_AVAILABLE"
    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  fi
  exit 1
fi

# Enable and start systemd unit
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "Service status:"
systemctl status "$SERVICE_NAME" --no-pager

echo "Last journal lines for $SERVICE_NAME:"
journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true

echo "Install complete."
