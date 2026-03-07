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
  heartbeatScript: string
  serviceFile: string
  timerFile: string
  bootstrapScript: string
  firstBootScript: string
  readme: string
}

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
    envLine("HERM_CAMERA_ONLINE", "true"),
    envLine("HERM_GPS_ONLINE", "true"),
  ].join("\n")

  const heartbeatScript = `#!/usr/bin/env bash
set -euo pipefail

source /etc/herm/device.env

payload_file="$(mktemp)"

cat >"$payload_file" <<EOF
{
  "device_secret": "$HERM_DEVICE_SECRET",
  "is_camera_online": \${HERM_CAMERA_ONLINE:-true},
  "is_gps_online": \${HERM_GPS_ONLINE:-true},
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

curl -fsS -X POST "$HERM_API_BASE_URL/api/device/heartbeat" \\
  -H "Content-Type: application/json" \\
  --data-binary @"$payload_file" >/dev/null

rm -f "$payload_file"
`

  const serviceFile = `[Unit]
Description=Herm heartbeat ping
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/herm-heartbeat
`

  const timerFile = `[Unit]
Description=Herm heartbeat timer

[Timer]
OnBootSec=30s
OnUnitActiveSec=120s
Unit=herm-heartbeat.service

[Install]
WantedBy=timers.target
`

  const bootstrapScript = `#!/usr/bin/env bash
set -euo pipefail

install -d -m 0755 /etc/herm
install -d -m 0755 /opt/herm

cat >/etc/herm/device.env <<'HERM_DEVICE_ENV'
${envFile}
HERM_DEVICE_ENV

cat >/usr/local/bin/herm-heartbeat <<'HERM_HEARTBEAT_SCRIPT'
${heartbeatScript}
HERM_HEARTBEAT_SCRIPT

chmod +x /usr/local/bin/herm-heartbeat

cat >/etc/systemd/system/herm-heartbeat.service <<'HERM_HEARTBEAT_SERVICE'
${serviceFile}
HERM_HEARTBEAT_SERVICE

cat >/etc/systemd/system/herm-heartbeat.timer <<'HERM_HEARTBEAT_TIMER'
${timerFile}
HERM_HEARTBEAT_TIMER

cat >/opt/herm/README.txt <<'HERM_README'
Herm module bootstrap complete.

Files installed:
- /etc/herm/device.env
- /usr/local/bin/herm-heartbeat
- /etc/systemd/system/herm-heartbeat.service
- /etc/systemd/system/herm-heartbeat.timer

Next:
1. Install your camera / YOLO / plate-detection runtime.
2. Keep posting plate sightings to ${input.apiBaseUrl}/api/device/plate-sighting
3. Keep posting local human detections to ${input.apiBaseUrl}/api/device/human-detection
HERM_README

systemctl daemon-reload
systemctl enable --now herm-heartbeat.timer
systemctl start herm-heartbeat.service || true

printf '\\nHerm bootstrap installed for %s (%s).\\n' ${shellEscape(input.deviceName)} ${shellEscape(
    input.deviceId
  )}
printf 'Heartbeat timer is active and will re-authenticate with the embedded device secret.\\n'
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
- installs a heartbeat script and systemd timer
- pings the Herm backend on first boot
- keeps the device linked without manual config edits
- can be written onto a mounted Raspberry Pi OS boot partition directly from the web app

After bootstrap, add your detector runtime and send events to:
- ${input.apiBaseUrl}/api/device/plate-sighting
- ${input.apiBaseUrl}/api/device/human-detection
`

  return {
    bootstrapCommand,
    envFile,
    heartbeatScript,
    serviceFile,
    timerFile,
    bootstrapScript,
    firstBootScript,
    readme,
  }
}
