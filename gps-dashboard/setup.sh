#!/bin/bash
set -euo pipefail

echo "==============================================="
echo "  Herm Pi Runtime Setup"
echo "==============================================="

# Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[1/4] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[1/4] Node.js $(node -v) already installed"
fi

# Python dependencies for camera service
echo "[2/4] Installing Python dependencies..."
if command -v pip3 >/dev/null 2>&1; then
  pip3 install --break-system-packages -r "$(dirname "$0")/requirements.txt" 2>/dev/null \
    || pip3 install -r "$(dirname "$0")/requirements.txt" 2>/dev/null \
    || echo "  (pip install failed — camera service may not work without manual install)"
else
  echo "  pip3 not found — install python3-pip for camera service"
fi

# Node.js dependencies
echo "[3/4] Installing Node.js dependencies..."
cd "$(dirname "$0")"
npm install --production

# Create config directory
echo "[4/4] Setting up config directory..."
sudo mkdir -p /etc/herm
if [ ! -f /etc/herm/settings.json ]; then
  echo '{"device":{"profile":"auto"}}' | sudo tee /etc/herm/settings.json >/dev/null
fi

echo ""
echo "==============================================="
echo "  Herm Pi runtime is ready!"
echo "  Local dashboard: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Camera streams:  http://$(hostname -I | awk '{print $1}'):8081/stream/front"
echo ""
echo "  Config: /etc/herm/device.env"
echo "  Start:  npm start (or systemctl start herm-runtime)"
echo "==============================================="
