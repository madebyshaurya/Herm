#!/bin/bash -e

# Install systemd services
install -v -m 644 "${ROOTFS_DIR}/opt/herm/gps-dashboard/herm-runtime.service" \
  "${ROOTFS_DIR}/etc/systemd/system/herm-runtime.service"

install -v -m 644 "${ROOTFS_DIR}/opt/herm/gps-dashboard/herm-firstboot.service" \
  "${ROOTFS_DIR}/etc/systemd/system/herm-firstboot.service"

# Enable firstboot service (runs once on first boot when /boot/herm/device.env exists)
on_chroot << 'CHEOF'
systemctl enable herm-firstboot.service
CHEOF
