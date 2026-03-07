# Herm Pi Runtime

The Herm Pi runtime (`gps-dashboard/`) is the firmware that runs on each Raspberry Pi device.

## What it does

- **Hardware auto-discovery** — detects cameras (CSI + USB), GPS, SIM7600 4G HAT, audio
- **Module manager** — start/stop/restart feature modules with health monitoring
- **SIM7600 initialization** — AT commands to enable GPS and cellular data
- **GPS parsing** — NMEA sentence parsing from serial GPS
- **Camera service** — Python child process for multi-camera capture, ONNX plate detection, MJPEG streaming
- **Local dashboard** — debug UI at `http://<pi-ip>:3000` with live camera feeds, GPS map, module status
- **Herm cloud sync** — heartbeat, telemetry, and plate sighting forwarding with offline outbox
- **Settings system** — configurable via local API or web portal

## Files

| File | Purpose |
|---|---|
| `server.js` | Main Node.js orchestrator |
| `hardware.js` | Hardware auto-discovery |
| `modules.js` | Module/plugin manager |
| `sim7600.js` | SIM7600 4G HAT AT command driver |
| `settings.js` | Settings system (persists to `/etc/herm/settings.json`) |
| `camera_service.py` | Python camera service (detection + streaming) |
| `requirements.txt` | Python dependencies for camera service |
| `dashboard.html` | Local debug dashboard |
| `firstboot.sh` | First-boot provisioning script |
| `herm-runtime.service` | systemd service for the runtime |
| `herm-firstboot.service` | systemd service for first-boot provisioning |

## Quick start

```bash
npm install
npm start
```

## Runtime env

Reads from `/etc/herm/device.env` (overridden by process env):

```bash
HERM_API_BASE_URL=https://hermai.xyz
HERM_DEVICE_SECRET=herm_xxx
HERM_GPS_PORT=/dev/ttyUSB1
HERM_GPS_BAUD=115200
HERM_HEARTBEAT_INTERVAL_SEC=60
HERM_TELEMETRY_INTERVAL_SEC=5
HERM_OUTBOX_DIR=/var/lib/herm/outbox
HERM_LOCAL_PORT=3000
HERM_LOCAL_API_TOKEN=
HERM_CAMERA_ONLINE=false
HERM_GPS_ONLINE=true
HERM_DEVICE_PROFILE=auto       # auto | full | watcher
HERM_SETTINGS_PATH=/etc/herm/settings.json
```

## Local API

### `GET /api/state` — Full runtime state (dashboard)
### `GET /api/health` — Hardware + module health
### `GET /api/settings` — Current settings
### `POST /api/settings` — Update settings (patch merge)
### `GET /api/modules` — Module status
### `POST /api/plates` — Submit detected plates
### `GET /stream/<role>` — MJPEG camera stream (proxied from camera service)
### `GET /snapshot/<role>` — JPEG snapshot (proxied from camera service)

## Camera service (Python)

The camera service runs as a managed child process. It handles:
- Multi-camera capture (picamera2 for CSI, OpenCV for USB)
- ONNX-based license plate detection (YOLOv8n + fast-plate-ocr)
- MJPEG streaming on port 8081
- Auto-posts detected plates to the Node.js runtime

```bash
# Standalone run (for testing)
pip install -r requirements.txt
python3 camera_service.py --port 8081
```

## Outbox

Failed sync events are stored as JSON files and replayed automatically when Herm becomes reachable.
