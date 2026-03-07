#!/bin/bash -e

# Install the Herm Pi runtime into /opt/herm
install -v -d "${ROOTFS_DIR}/opt/herm/gps-dashboard"
install -v -d "${ROOTFS_DIR}/opt/herm/gps-dashboard/models"
install -v -d "${ROOTFS_DIR}/etc/herm"

# Copy all runtime files
for f in server.js hardware.js modules.js sim7600.js settings.js camera_service.py \
         requirements.txt package.json dashboard.html firstboot.sh setup.sh README.md; do
  if [ -f "${STAGE_DIR}/../../gps-dashboard/${f}" ]; then
    install -v -m 644 "${STAGE_DIR}/../../gps-dashboard/${f}" "${ROOTFS_DIR}/opt/herm/gps-dashboard/${f}"
  fi
done

# Make scripts executable
chmod +x "${ROOTFS_DIR}/opt/herm/gps-dashboard/firstboot.sh"
chmod +x "${ROOTFS_DIR}/opt/herm/gps-dashboard/setup.sh"

# Install node_modules
on_chroot << 'CHEOF'
cd /opt/herm/gps-dashboard && npm install --production
chown -R pi:pi /opt/herm
echo '{"device":{"profile":"auto"}}' > /etc/herm/settings.json
CHEOF
