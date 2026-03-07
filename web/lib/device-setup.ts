type DeviceSetupInput = {
  apiBaseUrl: string
  bootstrapUrl: string
  deviceId: string
  deviceName: string
  deviceSecret: string
}

type DeviceSetupBundle = {
  bootstrapCommand: string
  envFile: string
  runtimeService: string
  bootstrapScript: string
  firstBootScript: string
  readme: string
}

const HERM_REPO_URL = "https://github.com/madebyshaurya/Herm.git"
const HERM_REPO_BRANCH = "main"

function shellEscape(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function envLine(key: string, value: string) {
  return `${key}=${shellEscape(value)}`
}

export function buildBootstrapCommand(input: Pick<DeviceSetupInput, "bootstrapUrl">) {
  return `curl -fsSL ${shellEscape(input.bootstrapUrl)} | sudo bash`
}

export function buildDeviceSetupBundle(input: DeviceSetupInput): DeviceSetupBundle {
  const envFile = [
    envLine("HERM_API_BASE_URL", input.apiBaseUrl),
    envLine("HERM_DEVICE_ID", input.deviceId),
    envLine("HERM_DEVICE_NAME", input.deviceName),
    envLine("HERM_DEVICE_SECRET", input.deviceSecret),
    envLine("HERM_CAMERA_ONLINE", "false"),
    envLine("HERM_GPS_ONLINE", "true"),
    envLine("HERM_GPS_PORT", "/dev/ttyAMA0"),
    envLine("HERM_GPS_BAUD", "9600"),
    envLine("HERM_HEARTBEAT_INTERVAL_SEC", "60"),
    envLine("HERM_TELEMETRY_INTERVAL_SEC", "5"),
    envLine("HERM_LOCAL_PORT", "3000"),
    envLine("HERM_REPO_URL", HERM_REPO_URL),
    envLine("HERM_REPO_BRANCH", HERM_REPO_BRANCH),
  ].join("\n")

  const runtimeService = `[Unit]
Description=Herm Pi runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/herm/device.env
WorkingDirectory=/opt/herm/runtime/gps-dashboard
ExecStart=/usr/bin/env npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`

  const bootstrapScript = `#!/usr/bin/env bash
set -euo pipefail

# ── Herm Installer TUI ──────────────────────────────────────────
# Pure bash — no extra dependencies needed on a fresh Pi.

# Colors
C_RESET="\\033[0m"
C_BOLD="\\033[1m"
C_DIM="\\033[2m"
C_CYAN="\\033[36m"
C_GREEN="\\033[32m"
C_YELLOW="\\033[33m"
C_RED="\\033[31m"
C_MAGENTA="\\033[35m"
C_BLUE="\\033[34m"
C_WHITE="\\033[97m"
C_BG_BLACK="\\033[40m"

# Gradient colors for the logo (256-color)
G1="\\033[38;5;39m"   # blue
G2="\\033[38;5;44m"   # cyan
G3="\\033[38;5;49m"   # teal
G4="\\033[38;5;48m"   # green-cyan
G5="\\033[38;5;83m"   # green
G6="\\033[38;5;118m"  # bright green

clear
echo ""

# ── ASCII Logo with gradient ──
echo -e "\${G1}  ██╗  ██╗\${G2}███████╗\${G3}██████╗ \${G4}███╗   ███╗\${C_RESET}"
echo -e "\${G1}  ██║  ██║\${G2}██╔════╝\${G3}██╔══██╗\${G4}████╗ ████║\${C_RESET}"
echo -e "\${G1}  ███████║\${G2}█████╗  \${G3}██████╔╝\${G4}██╔████╔██║\${C_RESET}"
echo -e "\${G1}  ██╔══██║\${G2}██╔══╝  \${G3}██╔══██╗\${G4}██║╚██╔╝██║\${C_RESET}"
echo -e "\${G1}  ██║  ██║\${G2}███████╗\${G3}██║  ██║\${G4}██║ ╚═╝ ██║\${C_RESET}"
echo -e "\${G1}  ╚═╝  ╚═╝\${G2}╚══════╝\${G3}╚═╝  ╚═╝\${G4}╚═╝     ╚═╝\${C_RESET}"
echo ""
echo -e "  \${C_DIM}Crowdsourced stolen vehicle detection network\${C_RESET}"
echo -e "  \${C_DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\${C_RESET}"
echo ""

# ── Device info ──
echo -e "  \${C_CYAN}▸\${C_RESET} Device:  \${C_BOLD}${input.deviceName}\${C_RESET}"
echo -e "  \${C_CYAN}▸\${C_RESET} ID:      \${C_DIM}${input.deviceId}\${C_RESET}"
echo -e "  \${C_CYAN}▸\${C_RESET} Server:  \${C_DIM}${input.apiBaseUrl}\${C_RESET}"
echo ""

# ── Progress helpers ──
STEP=0
TOTAL=6

step() {
  STEP=$((STEP + 1))
  echo ""
  echo -e "  \${C_GREEN}[\${STEP}/\${TOTAL}]\${C_RESET} \${C_BOLD}\$1\${C_RESET}"
  echo -e "  \${C_DIM}$(printf '%.0s─' {1..44})\${C_RESET}"
}

info() {
  echo -e "  \${C_DIM}   →\${C_RESET} \$1"
}

success() {
  echo -e "  \${C_GREEN}   ✓\${C_RESET} \$1"
}

warn() {
  echo -e "  \${C_YELLOW}   !\${C_RESET} \$1"
}

fail() {
  echo -e "  \${C_RED}   ✗\${C_RESET} \$1"
}

spinner() {
  local pid=\$1
  local chars="⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
  local i=0
  while kill -0 "\$pid" 2>/dev/null; do
    printf "\\r  \${C_CYAN}   %s\${C_RESET} %s" "\${chars:i%10:1}" "\$2"
    i=$((i + 1))
    sleep 0.1
  done
  printf "\\r"
}

# ── Interactive setup ──
echo -e "  \${C_YELLOW}This will install the Herm runtime on this Pi.\${C_RESET}"
echo -e "  \${C_DIM}It will install Node.js, Python deps, clone the repo,\${C_RESET}"
echo -e "  \${C_DIM}and set up a systemd service that starts on boot.\${C_RESET}"
echo ""

if [ -t 0 ]; then
  # Interactive mode — ask for confirmation
  printf "  \${C_BOLD}Continue? \${C_DIM}[Y/n]\${C_RESET} "
  read -r CONFIRM
  if [[ "\${CONFIRM:-y}" =~ ^[Nn] ]]; then
    echo -e "\\n  \${C_RED}Aborted.\${C_RESET}\\n"
    exit 1
  fi
else
  # Piped mode (curl | bash) — auto-continue
  echo -e "  \${C_DIM}Running in non-interactive mode — auto-continuing.\${C_RESET}"
fi

# ── Detect Pi hardware ──
step "Detecting hardware"
PI_MODEL=$(cat /proc/device-tree/model 2>/dev/null || echo "Unknown")
PI_RAM=$(free -m 2>/dev/null | awk 'NR==2{print \$2}' || echo "?")
PI_ARCH=$(uname -m)

info "Model: \${C_WHITE}\${PI_MODEL}\${C_RESET}"
info "RAM:   \${PI_RAM} MB"
info "Arch:  \${PI_ARCH}"

# Check for GPS
if [ -e /dev/ttyAMA0 ] || [ -e /dev/ttyUSB1 ]; then
  GPS_PORT=""
  if [ -e /dev/ttyAMA0 ]; then
    GPS_PORT="/dev/ttyAMA0"
  elif [ -e /dev/ttyUSB1 ]; then
    GPS_PORT="/dev/ttyUSB1"
  fi
  success "GPS serial found at \${C_CYAN}\${GPS_PORT}\${C_RESET}"
else
  warn "No GPS serial detected (can be added later)"
fi

# Check for cameras
CAM_COUNT=0
if ls /dev/video* 1>/dev/null 2>&1; then
  CAM_COUNT=$(ls /dev/video* 2>/dev/null | wc -l)
  success "Found \${CAM_COUNT} video device(s)"
else
  warn "No camera devices detected (can be added later)"
fi

# ── Install system packages ──
step "Installing system packages"
info "Updating package lists..."
apt-get update -qq >/dev/null 2>&1 &
spinner \$! "Updating apt..."
success "Package lists updated"

info "Installing git, curl, Node.js, Python3..."
apt-get install -y -qq git curl python3 python3-pip nodejs npm v4l-utils socat >/dev/null 2>&1 &
spinner \$! "Installing packages..."
success "System packages installed"

# ── Install Node.js 20 (if needed) ──
step "Setting up Node.js"
NODE_VER=$(node --version 2>/dev/null || echo "none")
if [[ "\${NODE_VER}" == v2* ]] || [[ "\${NODE_VER}" == "none" ]] || [[ "\${NODE_VER}" == v1[0-7]* ]]; then
  info "Current: \${NODE_VER} — upgrading to Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
  NODE_VER=$(node --version 2>/dev/null || echo "unknown")
  success "Node.js \${NODE_VER} installed"
else
  success "Node.js \${NODE_VER} is already good"
fi

# ── Write device config ──
step "Writing device configuration"
install -d -m 0755 /etc/herm
install -d -m 0755 /opt/herm/runtime

cat >/etc/herm/device.env <<'HERM_DEVICE_ENV'
${envFile}
HERM_DEVICE_ENV

chmod 600 /etc/herm/device.env
success "Config written to \${C_CYAN}/etc/herm/device.env\${C_RESET}"

# ── Clone / update Herm runtime ──
step "Downloading Herm runtime"
HERM_REPO_URL=${shellEscape(HERM_REPO_URL)}
HERM_REPO_BRANCH=${shellEscape(HERM_REPO_BRANCH)}

if [ -d /opt/herm/runtime/.git ]; then
  info "Updating existing installation..."
  git -C /opt/herm/runtime fetch --depth=1 origin "\${HERM_REPO_BRANCH}" 2>/dev/null
  git -C /opt/herm/runtime checkout "\${HERM_REPO_BRANCH}" 2>/dev/null
  git -C /opt/herm/runtime pull --ff-only origin "\${HERM_REPO_BRANCH}" 2>/dev/null
  success "Runtime updated"
else
  info "Cloning from GitHub..."
  rm -rf /opt/herm/runtime
  git clone --depth=1 --branch "\${HERM_REPO_BRANCH}" "\${HERM_REPO_URL}" /opt/herm/runtime >/dev/null 2>&1 &
  spinner \$! "Cloning repository..."
  success "Runtime cloned to \${C_CYAN}/opt/herm/runtime\${C_RESET}"
fi

# Run the setup script for npm + python deps
cd /opt/herm/runtime/gps-dashboard
info "Installing runtime dependencies..."
bash setup.sh >/dev/null 2>&1 &
spinner \$! "Installing npm & Python packages..."
success "Dependencies installed"

# ── Create and start systemd service ──
step "Starting Herm service"
cat >/etc/systemd/system/herm-runtime.service <<'EOF'
${runtimeService}
EOF

systemctl daemon-reload
systemctl enable herm-runtime.service >/dev/null 2>&1
systemctl start herm-runtime.service
success "herm-runtime.service \${C_GREEN}active\${C_RESET}"

# ── Done! ──
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print \$1}' || echo "?")

echo ""
echo ""
echo -e "  \${G3}╔══════════════════════════════════════════════╗\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  \${C_BOLD}\${C_GREEN}✓ Herm installed successfully!\${C_RESET}               \${G3}║\${C_RESET}"
echo -e "  \${G3}╠══════════════════════════════════════════════╣\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}                                              \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  Device:     \${C_BOLD}${input.deviceName}\${C_RESET}$(printf '%*s' \$((30 - \${#DEVICE_NAME_LEN:-0})) '')\${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  Dashboard:  \${C_CYAN}http://\${LOCAL_IP}:3000\${C_RESET}         \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  Portal:     \${C_CYAN}${input.apiBaseUrl}\${C_RESET}     \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  Status:     \${C_GREEN}● Running\${C_RESET}                      \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}                                              \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  \${C_DIM}Logs:  journalctl -u herm-runtime -f\${C_RESET}       \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}  \${C_DIM}Stop:  systemctl stop herm-runtime\${C_RESET}          \${G3}║\${C_RESET}"
echo -e "  \${G3}║\${C_RESET}                                              \${G3}║\${C_RESET}"
echo -e "  \${G3}╚══════════════════════════════════════════════╝\${C_RESET}"
echo ""
echo -e "  \${C_DIM}Your Pi is now reporting to the Herm network.\${C_RESET}"
echo -e "  \${C_DIM}Check ${input.apiBaseUrl}/dashboard/devices for live data.\${C_RESET}"
echo ""
`

  const firstBootScript = `#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/boot/firmware"
if [ ! -d "$BOOT_DIR" ]; then
  BOOT_DIR="/boot"
fi

bash "$BOOT_DIR/herm-bootstrap.sh"

python3 - "$BOOT_DIR/cmdline.txt" <<'PY'
from pathlib import Path
import sys

cmdline_path = Path(sys.argv[1])
content = cmdline_path.read_text(encoding="utf-8").strip()
tokens = [
    "systemd.run=/boot/firmware/herm-firstboot.sh",
    "systemd.run_success_action=reboot",
    "systemd.unit=kernel-command-line.target",
]
for token in tokens:
    content = content.replace(token, "").replace("  ", " ")
cmdline_path.write_text(content.strip() + "\\n", encoding="utf-8")
PY

rm -f "$BOOT_DIR/herm-firstboot.sh" "$BOOT_DIR/herm-bootstrap.sh"
`

  const bootstrapCommand = buildBootstrapCommand({ bootstrapUrl: input.bootstrapUrl })

  const readme = `# Herm Setup Bundle

Device: ${input.deviceName}
Device ID: ${input.deviceId}

Fastest install:
${bootstrapCommand}

  What this bundle does:
- writes /etc/herm/device.env with the embedded device secret
- clones ${HERM_REPO_URL} onto the Pi
- installs the gps-dashboard runtime and a systemd service
- starts local debug UI + heartbeat + telemetry sync on first boot
- can be written onto a mounted Raspberry Pi OS boot partition directly from the web app

After bootstrap, add your detector runtime and send events to:
- ${input.apiBaseUrl}/api/device/plate-sighting
- local plate batches to http://<pi-ip>:3000/api/plates
- ${input.apiBaseUrl}/api/device/human-detection
`

  return {
    bootstrapCommand,
    envFile,
    runtimeService,
    bootstrapScript,
    firstBootScript,
    readme,
  }
}
