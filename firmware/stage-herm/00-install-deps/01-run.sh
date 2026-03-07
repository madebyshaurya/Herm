#!/bin/bash -e

# Install Node.js 20 LTS
on_chroot << 'CHEOF'
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Python packages not available via apt
pip3 install --break-system-packages onnxruntime
CHEOF
