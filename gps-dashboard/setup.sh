#!/bin/bash
set -euo pipefail

echo "Setting up Herm Pi runtime..."

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

cd "$(dirname "$0")"
npm install

echo ""
echo "Herm Pi runtime is ready."
echo "Local dashboard: http://$(hostname -I | awk '{print $1}'):3000"
echo "Remember to provide /etc/herm/device.env or matching HERM_* env vars."
