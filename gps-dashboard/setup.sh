#!/bin/bash
# SENTINEL Dashboard Setup Script
# Run this on your Raspberry Pi

echo "🚗 Setting up SENTINEL dashboard..."

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node --version)"

# Install dependencies
cd ~/sentinel-dashboard
npm install

echo ""
echo "✅ Done! Starting dashboard..."
echo "📱 Open http://$(hostname -I | awk '{print $1}'):3000 on any device on your network"
echo ""

npm start
