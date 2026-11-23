#!/usr/bin/env bash
# Install or update AIOOnboarder on Debian/Ubuntu (bare metal, VM or Proxmox LXC).
#   curl -fsSL https://raw.githubusercontent.com/<you>/aioonboarder/main/deploy/install.sh | bash
# or, from a checkout:  sudo ./deploy/install.sh
set -euo pipefail

REPO="${AIOONBOARDER_REPO:-https://github.com/AshMT/aioonboarder.git}"
BRANCH="${AIOONBOARDER_BRANCH:-main}"
APP_DIR=/opt/aioonboarder
DATA_DIR=/var/lib/aioonboarder
PORT="${PORT:-8080}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "Installing Node.js 24…"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

id aioonboarder >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin aioonboarder
mkdir -p "$DATA_DIR"
chown aioonboarder:aioonboarder "$DATA_DIR"
chmod 700 "$DATA_DIR"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd || true)"
if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/package.json" ] && [ "$SRC_DIR" != "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  cp -a "$SRC_DIR/." "$APP_DIR/"
  rm -rf "$APP_DIR/node_modules" "$APP_DIR/data"
elif [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH" && git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund --silent 2>/dev/null || npm install --omit=dev --no-audit --no-fund --silent

cat >/etc/systemd/system/aioonboarder.service <<EOF
[Unit]
Description=AIOOnboarder
After=network-online.target
Wants=network-online.target

[Service]
User=aioonboarder
Group=aioonboarder
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA_DIR
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable -q aioonboarder
systemctl restart aioonboarder
sleep 1
systemctl --no-pager --lines=3 status aioonboarder || true
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "AIOOnboarder is running: http://${IP:-localhost}:$PORT"
