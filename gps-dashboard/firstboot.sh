#!/bin/bash
# Herm First Boot Provisioning Script
# Reads config from /boot/herm/ and sets up the device
# Runs once on first boot via herm-firstboot.service

set -euo pipefail

BOOT_CONFIG_DIR="/boot/herm"
HERM_CONFIG_DIR="/etc/herm"
HERM_INSTALL_DIR="/opt/herm"
LOG_FILE="/var/log/herm-firstboot.log"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Herm First Boot Provisioning ==="

# Create config directory
mkdir -p "$HERM_CONFIG_DIR"

# --- Device Environment ---
if [ -f "$BOOT_CONFIG_DIR/device.env" ]; then
  log "Loading device configuration..."
  cp "$BOOT_CONFIG_DIR/device.env" "$HERM_CONFIG_DIR/device.env"
  chmod 600 "$HERM_CONFIG_DIR/device.env"
  log "Device config installed to $HERM_CONFIG_DIR/device.env"
else
  log "WARNING: No device.env found in $BOOT_CONFIG_DIR"
fi

# --- WiFi Configuration ---
if [ -f "$BOOT_CONFIG_DIR/wifi.conf" ]; then
  log "Configuring WiFi..."
  source "$BOOT_CONFIG_DIR/wifi.conf"

  if [ -n "${WIFI_SSID:-}" ] && [ -n "${WIFI_PASSWORD:-}" ]; then
    COUNTRY="${WIFI_COUNTRY:-US}"

    # NetworkManager configuration (Bookworm default)
    if command -v nmcli &>/dev/null; then
      nmcli device wifi connect "$WIFI_SSID" password "$WIFI_PASSWORD" 2>&1 | tee -a "$LOG_FILE" || true
      log "WiFi configured via NetworkManager: $WIFI_SSID"
    else
      # Fallback: wpa_supplicant
      cat > /etc/wpa_supplicant/wpa_supplicant.conf <<EOF
country=$COUNTRY
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="$WIFI_SSID"
    psk="$WIFI_PASSWORD"
    key_mgmt=WPA-PSK
}
EOF
      rfkill unblock wifi 2>/dev/null || true
      wpa_cli -i wlan0 reconfigure 2>/dev/null || true
      log "WiFi configured via wpa_supplicant: $WIFI_SSID"
    fi
  fi
else
  log "No WiFi configuration found"
fi

# --- Device Profile ---
PROFILE="auto"
if [ -f "$BOOT_CONFIG_DIR/profile.conf" ]; then
  source "$BOOT_CONFIG_DIR/profile.conf"
  PROFILE="${DEVICE_PROFILE:-auto}"
fi

# Write initial settings.json
if [ ! -f "$HERM_CONFIG_DIR/settings.json" ]; then
  cat > "$HERM_CONFIG_DIR/settings.json" <<EOF
{
  "device": {
    "profile": "$PROFILE"
  }
}
EOF
  log "Initial settings.json created with profile=$PROFILE"
fi

# Set HERM_DEVICE_PROFILE env var for systemd
mkdir -p /etc/systemd/system/herm-runtime.service.d
cat > /etc/systemd/system/herm-runtime.service.d/profile.conf <<EOF
[Service]
Environment=HERM_DEVICE_PROFILE=$PROFILE
EOF

# --- Enable and Start Services ---
log "Enabling Herm services..."
systemctl daemon-reload
systemctl enable herm-runtime.service
systemctl start herm-runtime.service
log "herm-runtime.service started"

# --- Cleanup ---
# Remove boot config after provisioning (secrets shouldn't persist on boot partition)
if [ -f "$BOOT_CONFIG_DIR/device.env" ]; then
  rm -f "$BOOT_CONFIG_DIR/device.env"
  log "Removed device.env from boot partition (secrets moved to /etc/herm/)"
fi

# Disable firstboot service so it doesn't run again
systemctl disable herm-firstboot.service 2>/dev/null || true

log "=== First boot provisioning complete ==="
log "Device is now running. Check 'systemctl status herm-runtime' for status."
