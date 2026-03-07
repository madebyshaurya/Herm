# Herm Pi Runtime

`gps-dashboard/` is the Raspberry Pi runtime for Herm.

It does four jobs:

- parses GNSS data from the Pi's serial GPS device
- shows a slim local debug dashboard at `http://<pi-ip>:3000`
- posts heartbeat and rich telemetry to Herm
- accepts local plate batches at `POST /api/plates` and forwards them to Herm

## Start

```bash
npm install
npm start
```

## Runtime env

The runtime reads shell-style env values from `/etc/herm/device.env` by default, then lets process env override them.

Supported values:

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
```

## Local API

### `GET /api/state`

Returns the current local runtime state for the debug dashboard.

### `POST /api/plates`

Accepts plate batches from local camera/detection processes.

Example:

```json
{
  "plates": ["ABC123", "XYZ999"],
  "timestamp": "2026-03-07T12:00:00Z",
  "latitude": 43.6532,
  "longitude": -79.3832,
  "confidenceByPlate": {
    "ABC123": 0.97,
    "XYZ999": 0.91
  }
}
```

Optional snapshot upload:

```json
{
  "plates": ["ABC123"],
  "snapshotBase64": "<base64 bytes>",
  "snapshotMimeType": "image/jpeg"
}
```

If `HERM_LOCAL_API_TOKEN` is set, callers must send `Authorization: Bearer <token>`.

## Outbox

Failed sync events are stored as JSON files in the outbox directory and replayed automatically when Herm becomes reachable again.
