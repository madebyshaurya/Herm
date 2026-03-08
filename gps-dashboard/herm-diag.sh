#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# herm-diag — Quick hardware diagnostics for Herm dashcam Pi
#
# Usage:  sudo herm-diag          (run all checks)
#         sudo herm-diag gps      (GPS only)
#         sudo herm-diag cameras  (cameras only)
#         sudo herm-diag restart  (restart herm-runtime service)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
info() { echo -e "  ${CYAN}→${NC} $*"; }

banner() {
  echo ""
  echo -e "${BOLD}$1${NC}"
  echo "  ────────────────────────────────────────"
}

# ── GPS Diagnostics ─────────────────────────────────────────────
check_gps() {
  banner "GPS Diagnostics"

  # Check for SIM7600 USB serial devices
  local gps_port=""
  if [ -e /dev/ttyUSB1 ]; then
    gps_port="/dev/ttyUSB1"
    ok "GPS serial port found: ${gps_port}"
  elif [ -e /dev/ttyUSB0 ]; then
    gps_port="/dev/ttyUSB0"
    warn "Using fallback port: ${gps_port} (SIM7600 typically uses ttyUSB1)"
  else
    fail "No GPS serial port found (/dev/ttyUSB*)"
    info "Check that the SIM7600 HAT is properly seated on GPIO pins"
    info "Try: ls /dev/ttyUSB*"
    return 1
  fi

  # Check AT command port (/dev/ttyUSB2)
  local at_port="/dev/ttyUSB2"
  if [ -e "$at_port" ]; then
    ok "AT command port found: ${at_port}"

    # Query GPS power state
    local gps_state
    gps_state=$(echo -e "AT+CGPS?\r" | timeout 3 socat - "${at_port},b115200,raw,echo=0,cr" 2>/dev/null || true)
    if echo "$gps_state" | grep -q "+CGPS: 1"; then
      ok "GPS module is POWERED ON"
    elif echo "$gps_state" | grep -q "+CGPS: 0"; then
      warn "GPS module is powered OFF — turning it on..."
      echo -e "AT+CGPS=1\r" | timeout 3 socat - "${at_port},b115200,raw,echo=0,cr" 2>/dev/null || true
      sleep 1
      ok "Sent AT+CGPS=1 to enable GPS"
    else
      warn "Could not query GPS state (AT+CGPS? returned: $(echo "$gps_state" | head -3))"
    fi

    # Query GPS info (coordinates if available)
    local gps_info
    gps_info=$(echo -e "AT+CGPSINFO\r" | timeout 3 socat - "${at_port},b115200,raw,echo=0,cr" 2>/dev/null || true)
    if echo "$gps_info" | grep -qE '\+CGPSINFO: [0-9]'; then
      ok "GPS has a fix! Data: $(echo "$gps_info" | grep '+CGPSINFO' | head -1)"
    elif echo "$gps_info" | grep -q "+CGPSINFO: ,,"; then
      warn "GPS powered but NO FIX yet — move near a window"
    fi
  else
    warn "AT command port not found (${at_port}) — cannot query GPS state"
  fi

  # Check NMEA sentences flowing
  info "Reading NMEA data for 3 seconds from ${gps_port}..."
  local nmea_data
  nmea_data=$(timeout 3 cat "${gps_port}" 2>/dev/null || true)
  local line_count
  line_count=$(echo "$nmea_data" | grep -c '^\$G' || true)

  if [ "$line_count" -gt 0 ]; then
    ok "NMEA data flowing: ${line_count} sentences in 3s"

    # Check for GGA with fix
    local gga
    gga=$(echo "$nmea_data" | grep '^\$..GGA' | tail -1 || true)
    if [ -n "$gga" ]; then
      local fix_q
      fix_q=$(echo "$gga" | cut -d',' -f7)
      local sats
      sats=$(echo "$gga" | cut -d',' -f8)
      if [ "$fix_q" != "0" ] && [ -n "$fix_q" ]; then
        ok "GPS FIX acquired — quality=${fix_q}, satellites=${sats}"
      else
        warn "No GPS fix yet (quality=0), satellites in use: ${sats:-0}"
      fi
    fi

    # Show satellite count from GSV
    local gsv_sats
    gsv_sats=$(echo "$nmea_data" | grep '^\$..GSV' | head -1 | cut -d',' -f4 || true)
    if [ -n "$gsv_sats" ] && [ "$gsv_sats" != "0" ]; then
      info "Satellites in view: ${gsv_sats}"
    fi
  else
    fail "No NMEA data received from ${gps_port}"
    info "Possible causes:"
    info "  - GPS antenna not connected to the SIM7600 HAT's GNSS SMA port"
    info "  - GPS module not powered on (try: AT+CGPS=1 via ${at_port})"
    info "  - Wrong baud rate (expected 115200)"
  fi
}

# ── Camera Diagnostics ──────────────────────────────────────────
check_cameras() {
  banner "Camera Diagnostics"

  local cam_count=0

  # Check USB cameras
  info "Scanning V4L2 video devices..."
  local v4l2_devices
  v4l2_devices=$(ls /dev/video* 2>/dev/null || true)

  if [ -z "$v4l2_devices" ]; then
    fail "No /dev/video* devices found"
  else
    local seen_cards=""
    for dev in $v4l2_devices; do
      local card driver caps
      caps=$(v4l2-ctl --device="$dev" --all 2>/dev/null | head -30 || true)
      # Only show devices that support Video Capture
      if ! echo "$caps" | grep -q "Video Capture"; then
        continue
      fi
      card=$(echo "$caps" | grep "Card type" | head -1 | sed 's/.*: //' | tr -d '\n' || true)
      driver=$(echo "$caps" | grep "Driver name" | head -1 | sed 's/.*: //' | tr -d '\n' || true)

      # Skip non-camera devices
      if echo "$card" | grep -qiE 'codec|isp|simcom|qmi_wwan|vivid'; then
        continue
      fi
      if [ -z "$card" ]; then
        continue
      fi

      # Skip duplicate card entries (e.g. /dev/video2 metadata node for same USB camera)
      if echo "$seen_cards" | grep -qF "${card}:${driver}"; then
        # Still count it but don't show separate entry
        continue
      fi
      seen_cards="${seen_cards}${card}:${driver}\n"

      ok "Camera: ${card} (${dev}, driver=${driver})"

      # Test capture
      if timeout 3 v4l2-ctl --device="$dev" --stream-mmap=1 --stream-count=1 >/dev/null 2>&1; then
        ok "  Can capture frames from ${dev}"
      else
        warn "  Cannot capture from ${dev} — may be in use or misconfigured"
      fi

      cam_count=$((cam_count + 1))
    done
  fi

  # Check CSI camera
  if command -v libcamera-hello >/dev/null 2>&1; then
    local csi_list
    csi_list=$(libcamera-hello --list-cameras 2>&1 || true)
    if echo "$csi_list" | grep -qE '^\s*[0-9]+\s*:'; then
      ok "CSI camera detected via libcamera"
      cam_count=$((cam_count + 1))
    fi
  fi

  if command -v vcgencmd >/dev/null 2>&1; then
    local vcg
    vcg=$(vcgencmd get_camera 2>/dev/null || true)
    if echo "$vcg" | grep -q "detected=1"; then
      info "vcgencmd reports CSI camera detected"
    fi
  fi

  # Check herm camera service
  if curl -s http://localhost:8081/cameras >/dev/null 2>&1; then
    local cameras_json
    cameras_json=$(curl -s http://localhost:8081/cameras)
    ok "Herm camera service running"
    echo "$cameras_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
cams = data.get('cameras', {})
for role, info in cams.items():
    status = '🟢 running' if info.get('running') else '🔴 stopped'
    print(f'    {role}: {info.get(\"name\", \"?\")} ({info.get(\"type\", \"?\")}) — {status} [{info.get(\"resolution\", \"?\")}]')
" 2>/dev/null || info "  $(echo "$cameras_json" | head -1)"
  else
    warn "Herm camera service not running on port 8081"
  fi

  if [ "$cam_count" -eq 0 ]; then
    fail "No cameras detected!"
    info "USB: plug camera into Pi USB port, check with 'lsusb'"
    info "CSI: check ribbon cable, enable camera in 'sudo raspi-config'"
  else
    ok "Total cameras found: ${cam_count}"
  fi
}

# ── Service Control ─────────────────────────────────────────────
restart_service() {
  banner "Restarting Herm Runtime"
  if systemctl is-active --quiet herm-runtime 2>/dev/null; then
    info "Stopping herm-runtime..."
    systemctl restart herm-runtime
    sleep 2
    if systemctl is-active --quiet herm-runtime; then
      ok "herm-runtime restarted successfully"
    else
      fail "herm-runtime failed to restart"
      info "Check logs: journalctl -u herm-runtime -n 30"
    fi
  else
    warn "herm-runtime service not found or not running"
    info "Try: sudo systemctl start herm-runtime"
  fi
}

# ── System Info ─────────────────────────────────────────────────
check_system() {
  banner "System Info"
  local model
  model=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0' || echo "Unknown")
  local mem
  mem=$(free -m | awk '/Mem:/{printf "%d / %d MB", $3, $2}')
  local temp
  temp=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' || echo "N/A")
  local uptime_str
  uptime_str=$(uptime -p 2>/dev/null || uptime)

  info "Model:  ${model}"
  info "Memory: ${mem}"
  info "Temp:   ${temp}"
  info "Uptime: ${uptime_str}"

  # Check herm service
  if systemctl is-active --quiet herm-runtime 2>/dev/null; then
    ok "herm-runtime is running"
  else
    warn "herm-runtime is NOT running"
  fi

  # Check internet
  if curl -sf --max-time 3 https://www.hermai.xyz/api/device/heartbeat-check >/dev/null 2>&1; then
    ok "Internet connected (hermai.xyz reachable)"
  else
    warn "Cannot reach hermai.xyz"
  fi
}

# ── Main ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  HERM DIAGNOSTICS${NC}"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

case "${1:-all}" in
  gps)
    check_gps
    ;;
  cameras|camera|cam)
    check_cameras
    ;;
  restart)
    restart_service
    ;;
  system|sys)
    check_system
    ;;
  all)
    check_system
    check_gps
    check_cameras
    echo ""
    echo -e "  ${BOLD}Done.${NC} Run ${CYAN}herm-diag restart${NC} to reload the runtime."
    ;;
  *)
    echo "  Usage: herm-diag [all|gps|cameras|system|restart]"
    ;;
esac
echo ""
