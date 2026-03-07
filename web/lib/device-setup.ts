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
    envLine("HERM_GPS_PORT", "/dev/ttyUSB1"),
    envLine("HERM_GPS_BAUD", "115200"),
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

apt-get update
apt-get install -y git nodejs npm

install -d -m 0755 /etc/herm
install -d -m 0755 /opt/herm/runtime

cat >/etc/herm/device.env <<'HERM_DEVICE_ENV'
${envFile}
HERM_DEVICE_ENV

if [ -d /opt/herm/runtime/.git ]; then
  git -C /opt/herm/runtime fetch --depth=1 origin "$HERM_REPO_BRANCH"
  git -C /opt/herm/runtime checkout "$HERM_REPO_BRANCH"
  git -C /opt/herm/runtime pull --ff-only origin "$HERM_REPO_BRANCH"
else
  rm -rf /opt/herm/runtime
  git clone --depth=1 --branch "$HERM_REPO_BRANCH" "$HERM_REPO_URL" /opt/herm/runtime
fi

cd /opt/herm/runtime/gps-dashboard
bash setup.sh

cat >/etc/systemd/system/herm-runtime.service <<'EOF'
${runtimeService}
EOF

systemctl daemon-reload
systemctl enable --now herm-runtime.service

printf '\\nHerm bootstrap installed for %s (%s).\\n' ${shellEscape(input.deviceName)} ${shellEscape(
    input.deviceId
  )}
printf 'Pi runtime is active with a local dashboard on port 3000 and Herm sync pointed at %s.\\n' ${shellEscape(
    input.apiBaseUrl
  )}
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
