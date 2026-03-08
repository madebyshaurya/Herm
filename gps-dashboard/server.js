const http = require("http")
const fs = require("fs")
const os = require("os")
const path = require("path")
const crypto = require("crypto")
const { exec } = require("child_process")
const { URL } = require("url")

const { SerialPort } = require("serialport")
const { ReadlineParser } = require("@serialport/parser-readline")
const { createClient } = require("@supabase/supabase-js")

const { discover } = require("./hardware")
const { Sim7600 } = require("./sim7600")
const { ModuleManager, ChildProcessModule } = require("./modules")
const { Settings } = require("./settings")

const ENV_FILE_PATH = process.env.HERM_DEVICE_ENV || "/etc/herm/device.env"

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase())
}

function parseNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {}
  }

  const values = {}
  const source = fs.readFileSync(filePath, "utf8")

  source.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      return
    }

    const separatorIndex = trimmed.indexOf("=")
    if (separatorIndex === -1) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1)
    }

    value = value
      .replace(/'\"'\"'/g, "'")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")

    values[key] = value
  })

  return values
}

const fileEnv = loadEnvFile(ENV_FILE_PATH)
const config = {
  port: parseNumber(process.env.PORT || fileEnv.HERM_LOCAL_PORT, 3000),
  gpsPort: process.env.HERM_GPS_PORT || fileEnv.HERM_GPS_PORT || "/dev/ttyAMA0",
  gpsBaud: parseNumber(process.env.HERM_GPS_BAUD || fileEnv.HERM_GPS_BAUD, 115200),
  apiBaseUrl:
    (process.env.HERM_API_BASE_URL || fileEnv.HERM_API_BASE_URL || "https://hermai.xyz").replace(
      /\/$/,
      ""
    ),
  deviceSecret: process.env.HERM_DEVICE_SECRET || fileEnv.HERM_DEVICE_SECRET || "",
  heartbeatIntervalMs: parseNumber(
    process.env.HERM_HEARTBEAT_INTERVAL_SEC || fileEnv.HERM_HEARTBEAT_INTERVAL_SEC,
    60
  ) * 1000,
  telemetryIntervalMs: parseNumber(
    process.env.HERM_TELEMETRY_INTERVAL_SEC || fileEnv.HERM_TELEMETRY_INTERVAL_SEC,
    5
  ) * 1000,
  systemPollIntervalMs: parseNumber(
    process.env.HERM_SYSTEM_POLL_INTERVAL_SEC || fileEnv.HERM_SYSTEM_POLL_INTERVAL_SEC,
    2
  ) * 1000,
  outboxFlushIntervalMs: parseNumber(
    process.env.HERM_OUTBOX_FLUSH_INTERVAL_SEC || fileEnv.HERM_OUTBOX_FLUSH_INTERVAL_SEC,
    10
  ) * 1000,
  outboxDir:
    process.env.HERM_OUTBOX_DIR ||
    fileEnv.HERM_OUTBOX_DIR ||
    path.join(os.homedir(), ".herm-outbox"),
  maxOutboxItems: parseNumber(
    process.env.HERM_MAX_OUTBOX_ITEMS || fileEnv.HERM_MAX_OUTBOX_ITEMS,
    2000
  ),
  maxOutboxBytes: parseNumber(
    process.env.HERM_MAX_OUTBOX_BYTES || fileEnv.HERM_MAX_OUTBOX_BYTES,
    50 * 1024 * 1024
  ),
  localApiToken: process.env.HERM_LOCAL_API_TOKEN || fileEnv.HERM_LOCAL_API_TOKEN || "",
  cameraOnline: parseBoolean(process.env.HERM_CAMERA_ONLINE || fileEnv.HERM_CAMERA_ONLINE, false),
  gpsOnline: parseBoolean(process.env.HERM_GPS_ONLINE || fileEnv.HERM_GPS_ONLINE, true),
}

function nowIso() {
  return new Date().toISOString()
}

function addLog(message) {
  const timestamp = new Date().toLocaleTimeString("en-CA", { hour12: false })
  state.log.unshift(`[${timestamp}] ${message}`)
  state.log = state.log.slice(0, 80)
  console.log(message)
}

const state = {
  startedAt: Date.now(),
  serial: {
    path: config.gpsPort,
    baudRate: config.gpsBaud,
    connected: false,
    lastError: null,
    lastSentenceAt: null,
    reconnectDelayMs: 3000,
    nextReconnectAt: null,
  },
  gnss: {
    fix: false,
    fixQuality: 0,
    mode: 1,
    statusText: "SEARCHING",
    lat: null,
    lon: null,
    alt: null,
    speedKmh: 0,
    heading: null,
    hdop: null,
    vdop: null,
    pdop: null,
    satsInUse: 0,
    satsInView: 0,
    timestampUtc: null,
    lastFixAt: null,
    lastRaw: null,
    source: "auto",
  },
  sats: [],
  trail: [],
  system: {
    cpuPercent: 0,
    ramUsedMb: 0,
    ramTotalMb: 0,
    tempC: null,
    ip: null,
    uptimeSec: 0,
    internet: false,
  },
  plates: [],
  connection: {
    backendReachable: false,
    lastBackendOkAt: null,
    lastBackendError: null,
    lastHeartbeatAt: null,
    lastTelemetryAt: null,
    outboxDepth: 0,
    outboxBytes: 0,
    flushInProgress: false,
  },
  log: [],
}

// Module manager + settings
const settings = new Settings()
settings.load()

const moduleManager = new ModuleManager({ onLog: addLog })
let hardwareManifest = null
let sim7600Instance = null

let serialPort = null
let reconnectTimer = null
let lastTelemetrySentAt = 0
let lastHeartbeatSentAt = 0
let lastFixState = false

function readCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 2000 }, (error, stdout) => {
      if (error) {
        resolve("")
        return
      }

      resolve(stdout.trim())
    })
  })
}

async function refreshOutboxStats() {
  fs.mkdirSync(config.outboxDir, { recursive: true })
  const entries = fs
    .readdirSync(config.outboxDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))

  let totalBytes = 0
  entries.forEach((entry) => {
    totalBytes += fs.statSync(path.join(config.outboxDir, entry.name)).size
  })

  while (entries.length > config.maxOutboxItems || totalBytes > config.maxOutboxBytes) {
    const oldest = entries.shift()
    if (!oldest) {
      break
    }
    const filePath = path.join(config.outboxDir, oldest.name)
    try {
      totalBytes -= fs.statSync(filePath).size
      fs.unlinkSync(filePath)
    } catch {
      // Ignore eviction errors.
    }
  }

  state.connection.outboxDepth = entries.length
  state.connection.outboxBytes = Math.max(totalBytes, 0)
}

let backendFailureCount = 0
function markBackendFailure(error) {
  state.connection.backendReachable = false
  state.connection.lastBackendError = error instanceof Error ? error.message : String(error)
  backendFailureCount++
  // Only log every 30th failure to avoid spam
  if (backendFailureCount <= 3 || backendFailureCount % 30 === 0) {
    addLog(`Herm sync error (#${backendFailureCount}): ${state.connection.lastBackendError}`)
  }
}

function markBackendSuccess(label) {
  state.connection.backendReachable = true
  state.connection.lastBackendError = null
  state.connection.lastBackendOkAt = nowIso()
  if (label === "heartbeat") {
    state.connection.lastHeartbeatAt = state.connection.lastBackendOkAt
  }
  if (label === "telemetry") {
    state.connection.lastTelemetryAt = state.connection.lastBackendOkAt
  }
}

function normalizePlate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
}

function buildEvent(type, payload) {
  return {
    id: `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`,
    type,
    createdAt: nowIso(),
    payload,
  }
}

function storePlateEvent(plate, metadata = {}) {
  const normalizedPlate = normalizePlate(plate)
  if (!normalizedPlate) {
    return
  }

  state.plates.unshift({
    id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    plateRaw: plate,
    plateNormalized: normalizedPlate,
    detectedAt: metadata.timestamp || nowIso(),
    latitude: metadata.latitude ?? state.gnss.lat,
    longitude: metadata.longitude ?? state.gnss.lon,
    confidence: metadata.confidence ?? null,
    delivered: Boolean(metadata.delivered),
  })
  state.plates = state.plates.slice(0, 40)
}

function queueTrail(lat, lon) {
  if (lat == null || lon == null) {
    return
  }

  const previous = state.trail[state.trail.length - 1]
  if (!previous || previous[0] !== lat || previous[1] !== lon) {
    state.trail.push([lat, lon])
    if (state.trail.length > 120) {
      state.trail.shift()
    }
  }
}

function toDecimal(raw, hemisphere) {
  if (!raw || !hemisphere) {
    return null
  }

  const degreeLength = hemisphere === "N" || hemisphere === "S" ? 2 : 3
  const degrees = Number(raw.slice(0, degreeLength))
  const minutes = Number(raw.slice(degreeLength))

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) {
    return null
  }

  let decimal = degrees + minutes / 60
  if (hemisphere === "S" || hemisphere === "W") {
    decimal *= -1
  }
  return Number(decimal.toFixed(6))
}

function parseNumberOrNull(value) {
  if (value == null || value === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function updateFixStatus() {
  if (state.gnss.fix && state.gnss.fixQuality > 0) {
    if (state.gnss.mode >= 3) {
      state.gnss.statusText = "3D FIX"
      return
    }
    if (state.gnss.mode >= 2) {
      state.gnss.statusText = "2D FIX"
      return
    }
    state.gnss.statusText = "FIX"
    return
  }

  state.gnss.statusText = state.serial.connected ? "SEARCHING" : "GPS OFFLINE"
}

function parseGga(parts) {
  const lat = toDecimal(parts[2], parts[3])
  const lon = toDecimal(parts[4], parts[5])
  const fixQuality = parseNumberOrNull(parts[6]) || 0
  const satsInUse = parseNumberOrNull(parts[7]) || 0
  const hdop = parseNumberOrNull(parts[8])
  const alt = parseNumberOrNull(parts[9])

  state.gnss.fixQuality = fixQuality
  state.gnss.fix = fixQuality > 0
  state.gnss.satsInUse = satsInUse
  state.gnss.hdop = hdop
  state.gnss.alt = alt
  state.gnss.timestampUtc = parts[1] || state.gnss.timestampUtc

  if (lat != null && lon != null && fixQuality > 0) {
    state.gnss.lat = lat
    state.gnss.lon = lon
    state.gnss.lastFixAt = Date.now()
    queueTrail(lat, lon)
  }

  updateFixStatus()
}

function parseRmc(parts) {
  const valid = parts[2] === "A"
  const lat = toDecimal(parts[3], parts[4])
  const lon = toDecimal(parts[5], parts[6])
  const speedKnots = parseNumberOrNull(parts[7])
  const heading = parseNumberOrNull(parts[8])

  if (speedKnots != null) {
    state.gnss.speedKmh = Number((speedKnots * 1.852).toFixed(1))
  }
  if (heading != null) {
    state.gnss.heading = heading
  }

  if (valid && lat != null && lon != null) {
    state.gnss.lat = lat
    state.gnss.lon = lon
    state.gnss.fix = true
    state.gnss.lastFixAt = Date.now()
    queueTrail(lat, lon)
  }

  updateFixStatus()
}

function parseGsa(parts) {
  state.gnss.mode = parseNumberOrNull(parts[2]) || 1
  state.gnss.pdop = parseNumberOrNull(parts[15])
  state.gnss.hdop = parseNumberOrNull(parts[16]) ?? state.gnss.hdop
  state.gnss.vdop = parseNumberOrNull(parts[17])
  updateFixStatus()
}

function parseGsv(parts) {
  const totalMessages = parseNumberOrNull(parts[1]) || 1
  const messageNumber = parseNumberOrNull(parts[2]) || 1
  state.gnss.satsInView = parseNumberOrNull(parts[3]) || 0

  if (messageNumber === 1) {
    state.sats = []
  }

  for (let index = 4; index + 3 < parts.length; index += 4) {
    const prn = parts[index]
    if (!prn) {
      continue
    }
    state.sats.push({
      prn,
      elevation: parseNumberOrNull(parts[index + 1]),
      azimuth: parseNumberOrNull(parts[index + 2]),
      snr: parseNumberOrNull(parts[index + 3]),
    })
  }

  if (messageNumber === totalMessages) {
    state.sats = state.sats
      .filter(Boolean)
      .sort((left, right) => (right.snr || 0) - (left.snr || 0))
      .slice(0, 24)
  }
}

function parseGns(parts) {
  const lat = toDecimal(parts[2], parts[3])
  const lon = toDecimal(parts[4], parts[5])
  const modeText = parts[6] || ""
  const sats = parseNumberOrNull(parts[7]) || 0
  const hdop = parseNumberOrNull(parts[8])
  const alt = parseNumberOrNull(parts[9])
  const valid = /[ADFNPR]/.test(modeText)

  state.gnss.satsInUse = sats
  state.gnss.hdop = hdop ?? state.gnss.hdop
  if (alt != null) {
    state.gnss.alt = alt
  }

  if (valid) {
    state.gnss.fix = true
  }

  if (valid && lat != null && lon != null) {
    state.gnss.lat = lat
    state.gnss.lon = lon
    state.gnss.lastFixAt = Date.now()
    queueTrail(lat, lon)
  }

  updateFixStatus()
}

function parseLine(line) {
  if (!line || line[0] !== "$") {
    return
  }

  state.serial.lastSentenceAt = Date.now()
  state.gnss.lastRaw = line
  const sentence = line.split("*")[0]
  const parts = sentence.split(",")
  const type = parts[0].slice(-3)

  switch (type) {
    case "GGA":
      parseGga(parts)
      break
    case "RMC":
      parseRmc(parts)
      break
    case "GSA":
      parseGsa(parts)
      break
    case "GSV":
      parseGsv(parts)
      break
    case "GNS":
      parseGns(parts)
      break
    default:
      break
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return
  }

  state.serial.nextReconnectAt = Date.now() + state.serial.reconnectDelayMs
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    openSerial()
  }, state.serial.reconnectDelayMs)
}

function openSerial() {
  try {
    serialPort = new SerialPort({
      path: config.gpsPort,
      baudRate: config.gpsBaud,
      autoOpen: false,
    })
  } catch (error) {
    state.serial.lastError = error.message
    addLog(`Serial init failed: ${error.message}`)
    scheduleReconnect()
    return
  }

  serialPort.open((error) => {
    if (error) {
      state.serial.connected = false
      state.serial.lastError = error.message
      addLog(`GPS open failed on ${config.gpsPort}: ${error.message}`)
      state.serial.reconnectDelayMs = Math.min(state.serial.reconnectDelayMs * 2, 30000)
      scheduleReconnect()
      return
    }

    state.serial.connected = true
    state.serial.lastError = null
    state.serial.reconnectDelayMs = 3000
    state.serial.nextReconnectAt = null
    addLog(`GPS serial connected on ${config.gpsPort} @ ${config.gpsBaud}`)

    const parser = serialPort.pipe(new ReadlineParser({ delimiter: "\r\n" }))
    parser.on("data", parseLine)
    serialPort.on("close", () => {
      state.serial.connected = false
      state.serial.lastError = "Serial port closed"
      addLog("GPS serial closed; reconnecting")
      scheduleReconnect()
    })
    serialPort.on("error", (portError) => {
      state.serial.connected = false
      state.serial.lastError = portError.message
      addLog(`GPS serial error: ${portError.message}`)
      if (serialPort && serialPort.isOpen) {
        try {
          serialPort.close()
        } catch {
          // Ignore close errors.
        }
      }
      scheduleReconnect()
    })
  })
}

async function updateSystemStats() {
  const [cpuText, tempText, ramText, uptimeText, internetText] = await Promise.all([
    readCommand("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
    readCommand("cat /sys/class/thermal/thermal_zone0/temp"),
    readCommand("free -m | awk 'NR==2{printf \"%s %s\", $3,$2}'"),
    readCommand("cat /proc/uptime | awk '{print $1}'"),
    readCommand("ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && echo ok"),
  ])

  state.system.cpuPercent = parseNumber(cpuText.replace(",", "."), 0)
  state.system.tempC = tempText ? Number((Number(tempText) / 1000).toFixed(1)) : null

  const ramParts = ramText.split(/\s+/).filter(Boolean)
  state.system.ramUsedMb = parseNumber(ramParts[0], 0)
  state.system.ramTotalMb = parseNumber(ramParts[1], 0)
  state.system.uptimeSec = parseNumber(uptimeText, 0)
  state.system.internet = internetText === "ok"

  const interfaces = os.networkInterfaces()
  const ips = []
  let tailscaleIp = null
  Object.entries(interfaces).forEach(([name, entries]) => {
    entries?.forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        ips.push(entry.address)
        if (name === "tailscale0" || entry.address.startsWith("100.")) {
          tailscaleIp = entry.address
        }
      }
    })
  })
  // Report Tailscale IP first (works across networks), then local IP
  state.system.ip = tailscaleIp
    ? [tailscaleIp, ...ips.filter(ip => ip !== tailscaleIp)].join(",")
    : ips[0] || null
}

function buildHeartbeatPayload() {
  return {
    device_secret: config.deviceSecret,
    firmware_version: "gps-dashboard/3.0.0",
    is_camera_online: hardwareManifest?.capabilities?.hasCamera || config.cameraOnline,
    is_gps_online: (config.gpsOnline && state.serial.connected) || (sim7600Instance?.gpsEnabled ?? false),
    serial_connected: state.serial.connected,
    latitude: state.gnss.lat,
    longitude: state.gnss.lon,
    timestamp: nowIso(),
    hardware: hardwareManifest ? {
      profile: hardwareManifest.profile,
      platform: hardwareManifest.platform?.model,
      cameras: hardwareManifest.cameras?.length || 0,
      cameraDetails: (hardwareManifest.cameras || []).map(c => ({
        type: c.type,
        model: c.model,
        api: c.api || c.driver || "v4l2",
        path: c.path,
      })),
      i2cCameras: hardwareManifest.i2cCameras?.length || 0,
      has4g: hardwareManifest.capabilities?.has4g || false,
      hasGps: hardwareManifest.capabilities?.hasGps || false,
      hasCsi: hardwareManifest.capabilities?.hasCsi || false,
      hasUsb: hardwareManifest.capabilities?.hasUsb || false,
      csiEnabled: hardwareManifest.capabilities?.csiEnabled || false,
      gpsSource: hardwareManifest.gps?.source || "none",
    } : null,
    modules: moduleManager.status(),
  }
}

function buildTelemetryPayload() {
  return {
    device_secret: config.deviceSecret,
    firmware_version: "gps-dashboard/3.0.0",
    timestamp: nowIso(),
    serial: {
      path: config.gpsPort,
      connected: state.serial.connected,
      lastError: state.serial.lastError,
    },
    gnss: {
      fix: state.gnss.fix,
      fixQuality: state.gnss.fixQuality,
      mode: state.gnss.mode,
      statusText: state.gnss.statusText,
      lat: state.gnss.lat,
      lon: state.gnss.lon,
      alt: state.gnss.alt,
      speedKmh: state.gnss.speedKmh,
      heading: state.gnss.heading,
      hdop: state.gnss.hdop,
      vdop: state.gnss.vdop,
      pdop: state.gnss.pdop,
      satsInUse: state.gnss.satsInUse,
      satsInView: state.gnss.satsInView,
      timestampUtc: state.gnss.timestampUtc,
      source: state.gnss.source,
    },
    satellites: state.sats,
    system: {
      cpuPercent: state.system.cpuPercent,
      ramUsedMb: state.system.ramUsedMb,
      ramTotalMb: state.system.ramTotalMb,
      tempC: state.system.tempC,
      ip: state.system.ip,
      uptimeSec: state.system.uptimeSec,
      internet: state.system.internet,
    },
  }
}

function buildPlatePayload(plate, metadata = {}) {
  return {
    device_secret: config.deviceSecret,
    plateRaw: plate,
    confidence: metadata.confidence ?? null,
    latitude: metadata.latitude ?? state.gnss.lat,
    longitude: metadata.longitude ?? state.gnss.lon,
    timestamp: metadata.timestamp || nowIso(),
    snapshotBase64: metadata.snapshotBase64 || null,
    snapshotMimeType: metadata.snapshotMimeType || null,
  }
}

async function postJsonEvent(endpoint, payload, label) {
  if (!config.apiBaseUrl || !config.deviceSecret) {
    throw new Error("Missing HERM_API_BASE_URL or HERM_DEVICE_SECRET")
  }

  const response = await fetch(new URL(endpoint, `${config.apiBaseUrl}/`).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${label} failed with ${response.status}: ${text || response.statusText}`)
  }

  return response.json().catch(() => null)
}

async function postPlateEvent(payload) {
  const hasSnapshot = Boolean(payload.snapshotBase64)
  if (!hasSnapshot) {
    return postJsonEvent("/api/device/plate-sighting", payload, "plate sync")
  }

  const formData = new FormData()
  formData.append("device_secret", payload.device_secret)
  formData.append("plateRaw", payload.plateRaw)
  if (payload.confidence != null) {
    formData.append("confidence", String(payload.confidence))
  }
  if (payload.latitude != null) {
    formData.append("latitude", String(payload.latitude))
  }
  if (payload.longitude != null) {
    formData.append("longitude", String(payload.longitude))
  }
  if (payload.timestamp) {
    formData.append("timestamp", payload.timestamp)
  }

  const mimeType = payload.snapshotMimeType || "image/jpeg"
  const snapshotBuffer = Buffer.from(payload.snapshotBase64, "base64")
  const extension = mimeType.split("/")[1] || "jpg"
  formData.append(
    "snapshot",
    new Blob([snapshotBuffer], { type: mimeType }),
    `plate-${Date.now()}.${extension}`
  )

  const response = await fetch(new URL("/api/device/plate-sighting", `${config.apiBaseUrl}/`).toString(), {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`plate sync failed with ${response.status}: ${text || response.statusText}`)
  }

  return response.json().catch(() => null)
}

async function deliverEvent(event) {
  switch (event.type) {
    case "heartbeat":
      await postJsonEvent("/api/device/heartbeat", event.payload, "heartbeat")
      markBackendSuccess("heartbeat")
      break
    case "telemetry":
      await postJsonEvent("/api/device/telemetry", event.payload, "telemetry")
      markBackendSuccess("telemetry")
      break
    case "plate":
      await postPlateEvent(event.payload)
      markBackendSuccess("telemetry")
      break
    default:
      throw new Error(`Unknown event type: ${event.type}`)
  }
}

function persistEvent(event) {
  fs.mkdirSync(config.outboxDir, { recursive: true })
  const filePath = path.join(config.outboxDir, `${event.createdAt}-${event.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(event))
  refreshOutboxStats()
}

async function enqueueOrSend(event) {
  try {
    await deliverEvent(event)
    return true
  } catch (error) {
    markBackendFailure(error)
    persistEvent(event)
    return false
  }
}

async function flushOutbox() {
  if (state.connection.flushInProgress) {
    return
  }

  state.connection.flushInProgress = true
  fs.mkdirSync(config.outboxDir, { recursive: true })

  try {
    const files = fs
      .readdirSync(config.outboxDir)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .slice(0, 20)

    for (const file of files) {
      const filePath = path.join(config.outboxDir, file)
      try {
        const event = JSON.parse(fs.readFileSync(filePath, "utf8"))
        await deliverEvent(event)
        fs.unlinkSync(filePath)
      } catch (error) {
        markBackendFailure(error)
        break
      }
    }
  } finally {
    state.connection.flushInProgress = false
    refreshOutboxStats()
  }
}

async function sendHeartbeat() {
  if (Date.now() - lastHeartbeatSentAt < config.heartbeatIntervalMs - 250) {
    return
  }
  lastHeartbeatSentAt = Date.now()
  await enqueueOrSend(buildEvent("heartbeat", buildHeartbeatPayload()))
}

async function sendTelemetry(force = false) {
  if (!force && Date.now() - lastTelemetrySentAt < config.telemetryIntervalMs - 250) {
    return
  }
  lastTelemetrySentAt = Date.now()
  await enqueueOrSend(buildEvent("telemetry", buildTelemetryPayload()))
}

// ── Camera + Plate Detection Pipeline ────────────────────────────────────────
// Dual pipeline: plate_watch C++ binary handles capture + detection at full
// resolution. Node reads annotated frames and pushes thumbnails to dashboard.
// Falls back to plain ffmpeg if plate_watch isn't compiled.

const FRAME_CAPTURE_FILE = "/tmp/herm-latest-frame.jpg"
const FRAME_PUSH_INTERVAL_MS = 150  // push every 150ms (~7 fps Realtime target)
const DB_PUSH_INTERVAL_MS = 2000    // DB persistence every 2s (saves API calls)
const PLATE_POLL_INTERVAL_MS = 2000 // poll plate_watch /plates every 2s
let directCaptureProc = null
let directCaptureDev = null
let plateWatchProc = null
let plateWatchReady = false
let framePushLogCount = 0
let lastPolledPlates = []
let framePushing = false            // guard against overlapping pushes

// Supabase Realtime direct broadcasting (skips Vercel for low-latency streaming)
const SUPABASE_URL = process.env.HERM_SUPABASE_URL || fileEnv.HERM_SUPABASE_URL || "https://clznmfqwnbmbxltpkdle.supabase.co"
const SUPABASE_ANON_KEY = process.env.HERM_SUPABASE_ANON_KEY || fileEnv.HERM_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsem5tZnF3bmJtYnhsdHBrZGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTU2NzksImV4cCI6MjA4ODQzMTY3OX0.YyP_lIKBf3ajJUAlXW_nABMzD1BgUwDH1IFv1LheFYo"
let realtimeDeviceId = null         // learned from first API response
let realtimeChannel = null
let realtimeClient = null
let realtimeReady = false           // true only when channel is SUBSCRIBED
let lastDbPushTime = 0              // track when we last pushed to DB

function findUsbCameraDevice() {
  try {
    const { execSync } = require("child_process")
    const devList = execSync("v4l2-ctl --list-devices 2>/dev/null || true", {
      timeout: 3000, encoding: "utf8",
    })
    let currentDevice = null
    for (const line of devList.split("\n")) {
      if (line && !line.startsWith("\t") && !line.startsWith(" ")) {
        currentDevice = line.toLowerCase()
      } else if (line.trim().startsWith("/dev/video") && currentDevice) {
        if (
          currentDevice.includes("usb") || currentDevice.includes("uvc") ||
          (currentDevice.includes("camera") && !currentDevice.includes("unicam") && !currentDevice.includes("bcm2835"))
        ) {
          return line.trim()
        }
      }
    }
  } catch {}
  return null
}

function findPlateWatchBinary() {
  const candidates = [
    path.join(__dirname, "build", "plate_watch"),
    path.join(__dirname, "plate_watch"),
    "/usr/local/bin/plate_watch",
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function startPlateWatch() {
  if (plateWatchProc) return
  const binary = findPlateWatchBinary()
  if (!binary) return false

  const dev = findUsbCameraDevice()
  if (!dev) return false

  // Kill ffmpeg first — can't have two processes on the same camera
  if (directCaptureProc) {
    addLog("Stopping ffmpeg to hand camera to plate_watch...")
    try { directCaptureProc.kill("SIGTERM") } catch {}
    directCaptureProc = null
  }

  const modelsDir = path.join(__dirname, "models")
  const { spawn: spawnProc } = require("child_process")

  const args = [
    "--device", dev,
    "--models", modelsDir,
    "--port", "8082",
  ]

  plateWatchProc = spawnProc(binary, args, {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
  })

  plateWatchProc.stdout.on("data", (data) => {
    const msg = data.toString().trim()
    if (msg) addLog(`plate_watch: ${msg.slice(0, 200)}`)
  })
  plateWatchProc.stderr.on("data", (data) => {
    const msg = data.toString().trim()
    if (msg) addLog(`plate_watch err: ${msg.slice(0, 200)}`)
  })

  plateWatchProc.on("exit", (code) => {
    addLog(`plate_watch exited (code=${code}), restarting in 5s...`)
    plateWatchProc = null
    plateWatchReady = false
    setTimeout(startPlateWatch, 5000)
  })
  plateWatchProc.on("error", (err) => {
    addLog(`plate_watch spawn error: ${err.message}`)
    plateWatchProc = null
  })

  addLog(`plate_watch started: ${binary} (camera: ${dev})`)

  // Health-check loop to mark as ready
  const healthCheck = setInterval(async () => {
    try {
      const res = await fetch("http://localhost:8082/health", {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) {
        plateWatchReady = true
        addLog("plate_watch is ready (health OK)")
        clearInterval(healthCheck)
      }
    } catch {}
  }, 1000)
  // Give up after 30s
  setTimeout(() => clearInterval(healthCheck), 30000)

  return true
}

// Fallback: plain ffmpeg capture (no detection overlays)
function startDirectCapture() {
  if (directCaptureProc || plateWatchProc) return
  directCaptureDev = findUsbCameraDevice()
  if (!directCaptureDev) return

  const { spawn: spawnProc } = require("child_process")
  directCaptureProc = spawnProc("ffmpeg", [
    "-f", "v4l2", "-framerate", "10", "-video_size", "640x480",
    "-i", directCaptureDev,
    "-vf", "fps=10",
    "-q:v", "8",
    "-update", "1", "-y", FRAME_CAPTURE_FILE,
  ], { stdio: ["ignore", "ignore", "ignore"] })

  directCaptureProc.on("exit", (code) => {
    addLog(`ffmpeg capture exited (code=${code}), restarting in 2s...`)
    directCaptureProc = null
    setTimeout(startDirectCapture, 2000)
  })
  directCaptureProc.on("error", () => { directCaptureProc = null })
  addLog(`ffmpeg capture started: ${directCaptureDev} → 640x480 @ 10fps (no plate detection)`)
}

function readLatestFrame() {
  try {
    const stat = fs.statSync(FRAME_CAPTURE_FILE)
    if (Date.now() - stat.mtimeMs > 3000) return null
    if (stat.size < 500) return null
    return fs.readFileSync(FRAME_CAPTURE_FILE)
  } catch { return null }
}

async function getFrameFromPlateWatch() {
  try {
    const snapRes = await fetch("http://localhost:8082/snapshot", {
      signal: AbortSignal.timeout(800),
    })
    if (snapRes.ok) {
      const buf = Buffer.from(await snapRes.arrayBuffer())
      if (buf.length > 200) return buf
    }
  } catch {}
  return null
}

// ── Plate polling ───────────────────────────────────────────────────────────
async function pollPlates() {
  if (!plateWatchReady) return
  try {
    const res = await fetch("http://localhost:8082/plates", {
      signal: AbortSignal.timeout(1000),
    })
    if (!res.ok) return
    const plates = await res.json()
    if (!Array.isArray(plates) || plates.length === 0) return

    // Deduplicate against last poll
    const lastTexts = new Set(lastPolledPlates.map((p) => p.text))
    const newPlates = plates.filter((p) => !lastTexts.has(p.text))
    lastPolledPlates = plates

    if (newPlates.length === 0) return

    // Get a snapshot for the sighting
    let snapshotBase64 = null
    const frameBuf = await getFrameFromPlateWatch()
    if (frameBuf) snapshotBase64 = frameBuf.toString("base64")

    const plateTexts = newPlates.map((p) => p.text)
    const confidenceByPlate = {}
    for (const p of newPlates) {
      confidenceByPlate[p.text] = (p.confidence || 0) / 100 // plate_watch uses 0-100 scale
    }

    addLog(`Plates detected: ${plateTexts.join(", ")}`)

    await submitPlates({
      plates: plateTexts,
      confidenceByPlate,
      snapshotBase64,
      snapshotMimeType: "image/jpeg",
    })
  } catch (err) {
    if (!plateWatchReady) return // Don't log when plate_watch isn't ready yet
    addLog(`Plate poll error: ${err.message}`)
  }
}

// ── Frame push ──────────────────────────────────────────────────────────────
let framePushSuccessCount = 0
let framePushNoFrameCount = 0
let framePushErrorCount = 0

async function pushCameraFrames() {
  if (framePushing) return // prevent overlap
  framePushing = true
  try {
    await _pushCameraFramesInner()
  } finally {
    framePushing = false
  }
}

async function _pushCameraFramesInner() {
  // Priority 1: plate_watch /snapshot (has detection overlays drawn on frame)
  let frameBuf = null
  let role = "front"
  let cameraName = "USB Camera (plate detection)"

  if (plateWatchReady) {
    frameBuf = await getFrameFromPlateWatch()
  }

  // Priority 2: ffmpeg file
  if (!frameBuf) {
    frameBuf = readLatestFrame()
    cameraName = "USB Camera"
  }

  if (!frameBuf) {
    framePushNoFrameCount++
    if (framePushNoFrameCount % 60 === 1) {
      addLog(`No frame available (plate_watch: ${plateWatchReady}, ffmpeg: ${!!directCaptureProc}, dev: ${directCaptureDev || 'none'})`)
    }
    if (!directCaptureProc && !plateWatchProc) startDirectCapture()
    return
  }

  const frameB64 = frameBuf.toString("base64")

  // Fast path: broadcast directly via Supabase Realtime (no Vercel round-trip)
  if (realtimeChannel && realtimeReady) {
    realtimeChannel.send({
      type: "broadcast",
      event: "frame",
      payload: { role, camera_name: cameraName, frame: frameB64 },
    }).catch(() => {/* fire-and-forget */})
  }

  // Slow path: push to DB via HTTP API (every DB_PUSH_INTERVAL_MS for persistence)
  const now = Date.now()
  const shouldPushDb = (now - lastDbPushTime) >= DB_PUSH_INTERVAL_MS
  if (shouldPushDb && config.apiBaseUrl && config.deviceSecret) {
    lastDbPushTime = now
    try {
      const response = await fetch(
        new URL("/api/device/frame", `${config.apiBaseUrl}/`).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_secret: config.deviceSecret,
            frames: [{ role, camera_name: cameraName, frame_base64: frameB64 }],
          }),
          signal: AbortSignal.timeout(4000),
        }
      )
      if (response.ok) {
        framePushSuccessCount++
        const data = await response.json().catch(() => ({}))
        // Learn device_id from API response to set up Realtime channel
        if (data.device_id && !realtimeDeviceId) {
          realtimeDeviceId = data.device_id
          setupRealtimeChannel()
        }
        if (framePushSuccessCount === 1 || framePushSuccessCount % 120 === 0) {
          addLog(`Frame pushed OK (total=${framePushSuccessCount}, size=${frameB64.length}, realtime=${!!realtimeChannel})`)
        }
      } else {
        framePushErrorCount++
        if (framePushErrorCount % 30 === 1) {
          const body = await response.text().catch(() => '')
          addLog(`Frame push HTTP ${response.status}: ${body.slice(0, 100)}`)
        }
      }
    } catch (err) {
      framePushErrorCount++
      if (framePushErrorCount % 30 === 1) {
        addLog(`Frame push error: ${err.message}`)
      }
    }
  } else if (!config.apiBaseUrl && framePushLogCount++ === 0) {
    addLog(`Frame push SKIPPED — missing apiBaseUrl(${!!config.apiBaseUrl}) or deviceSecret(${!!config.deviceSecret})`)
  }
}

function setupRealtimeChannel() {
  if (realtimeChannel) return
  try {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
    realtimeChannel = realtimeClient.channel(`device-frames:${realtimeDeviceId}`, {
      config: { broadcast: { self: false } },
    })
    realtimeChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        realtimeReady = true
        addLog(`Realtime streaming active (device: ${realtimeDeviceId})`)
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        realtimeReady = false
        addLog(`Realtime channel ${status}, falling back to HTTP`)
      }
    })
  } catch (err) {
    addLog(`Realtime setup failed: ${err.message}`)
    realtimeChannel = null
    realtimeReady = false
  }
}

async function submitPlates(input) {
  const timestamp = input.timestamp || nowIso()
  const plates = Array.isArray(input.plates) ? input.plates : []
  const accepted = []

  for (const plate of plates) {
    const normalizedPlate = normalizePlate(plate)
    if (!normalizedPlate) {
      continue
    }

    const confidenceByPlate = input.confidenceByPlate || {}
    const payload = buildPlatePayload(normalizedPlate, {
      timestamp,
      latitude: input.latitude,
      longitude: input.longitude,
      confidence: confidenceByPlate[normalizedPlate] ?? confidenceByPlate[plate] ?? null,
      snapshotBase64: input.snapshotBase64 || null,
      snapshotMimeType: input.snapshotMimeType || null,
    })

    const delivered = await enqueueOrSend(buildEvent("plate", payload))
    storePlateEvent(normalizedPlate, {
      timestamp,
      latitude: payload.latitude,
      longitude: payload.longitude,
      confidence: payload.confidence,
      delivered,
    })
    accepted.push(normalizedPlate)
  }

  return accepted
}

function getPublicState() {
  return {
    startedAt: state.startedAt,
    serial: state.serial,
    gnss: state.gnss,
    satellites: state.sats,
    trail: state.trail,
    system: state.system,
    plates: state.plates,
    connection: state.connection,
    config: {
      gpsPort: config.gpsPort,
      gpsBaud: config.gpsBaud,
      apiBaseUrl: config.apiBaseUrl,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      telemetryIntervalMs: config.telemetryIntervalMs,
    },
    hardware: hardwareManifest,
    modules: moduleManager.status(),
    modem: sim7600Instance ? sim7600Instance.getStatus() : null,
    settings: settings.toJSON(),
    log: state.log,
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function unauthorized(response) {
  response.writeHead(401, { "Content-Type": "application/json" })
  response.end(JSON.stringify({ ok: false, error: "Invalid local API token." }))
}

async function handleApi(request, response) {
  if (request.method === "GET" && request.url === "/api/state") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ ok: true, state: getPublicState() }))
    return true
  }

  if (request.method === "GET" && request.url === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({
      ok: true,
      hardware: hardwareManifest,
      modules: moduleManager.healthAll(),
      modem: sim7600Instance ? sim7600Instance.getStatus() : null,
    }))
    return true
  }

  if (request.method === "GET" && request.url === "/api/settings") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ ok: true, settings: settings.toJSON() }))
    return true
  }

  if (request.method === "POST" && request.url === "/api/settings") {
    if (config.localApiToken) {
      const authHeader = request.headers.authorization || ""
      if (authHeader !== `Bearer ${config.localApiToken}`) {
        unauthorized(response)
        return true
      }
    }

    try {
      const rawBody = await readRequestBody(request)
      const patch = JSON.parse(rawBody || "{}")
      const changes = settings.update(patch)
      settings.save()
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: true, changes, settings: settings.toJSON() }))
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: false, error: error.message }))
    }
    return true
  }

  if (request.method === "GET" && request.url === "/api/modules") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ ok: true, modules: moduleManager.healthAll() }))
    return true
  }

  if (request.method === "POST" && request.url === "/api/plates") {
    if (config.localApiToken) {
      const authHeader = request.headers.authorization || ""
      if (authHeader !== `Bearer ${config.localApiToken}`) {
        unauthorized(response)
        return true
      }
    }

    try {
      const rawBody = await readRequestBody(request)
      const payload = JSON.parse(rawBody || "{}")
      const accepted = await submitPlates(payload)
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: true, accepted }))
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: false, error: error.message }))
    }
    return true
  }

  if (request.method === "POST" && request.url === "/api/ota/setup") {
    try {
      const rawBody = await readRequestBody(request)
      const payload = JSON.parse(rawBody || "{}")
      const { deviceId, deviceSecret, bootstrapUrl, wifiSsid, wifiPassword, wifiCountry, profile: deviceProfile } = payload

      // Write config files to /boot/herm/ (or /boot/firmware/herm/)
      const fs = require("fs")
      const bootBase = fs.existsSync("/boot/firmware") ? "/boot/firmware/herm" : "/boot/herm"
      const etcDir = "/etc/herm"

      try { fs.mkdirSync(bootBase, { recursive: true }) } catch {}
      try { fs.mkdirSync(etcDir, { recursive: true }) } catch {}

      // Write device.env
      const envLines = [
        `HERM_API_BASE_URL='${config.apiBaseUrl || "https://hermai.xyz"}'`,
        `HERM_DEVICE_ID='${deviceId || config.deviceId}'`,
        `HERM_DEVICE_SECRET='${deviceSecret || ""}'`,
        `HERM_DEVICE_PROFILE='${deviceProfile || "auto"}'`,
        `HERM_GPS_ONLINE='true'`,
        `HERM_GPS_PORT='/dev/ttyUSB1'`,
        `HERM_GPS_BAUD='115200'`,
        `HERM_HEARTBEAT_INTERVAL_SEC='60'`,
        `HERM_TELEMETRY_INTERVAL_SEC='5'`,
        `HERM_LOCAL_PORT='3000'`,
      ]
      fs.writeFileSync(`${etcDir}/device.env`, envLines.join("\n") + "\n")

      // Write WiFi config
      if (wifiSsid) {
        const wifiConf = `WIFI_SSID="${wifiSsid}"\nWIFI_PASSWORD="${wifiPassword || ""}"\nWIFI_COUNTRY="${wifiCountry || "US"}"\n`
        fs.writeFileSync(`${bootBase}/wifi.conf`, wifiConf)
      }

      // Write profile
      fs.writeFileSync(`${bootBase}/profile.conf`, `DEVICE_PROFILE=${deviceProfile || "auto"}\n`)

      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: true, message: "OTA setup applied. Restarting…" }))

      // Restart the runtime after a brief delay
      setTimeout(() => process.exit(0), 1000) // systemd will restart us
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: false, error: error.message }))
    }
    return true
  }

  return false
}

const dashboardPath = path.join(__dirname, "dashboard.html")

const server = http.createServer(async (request, response) => {
  if (await handleApi(request, response)) {
    return
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "text/plain" })
    response.end("Method not allowed")
    return
  }

  if (request.url === "/" || request.url === "/index.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    response.end(fs.readFileSync(dashboardPath, "utf8"))
    return
  }

  // Proxy camera stream from Python service
  if (request.url.startsWith("/stream/") || request.url.startsWith("/snapshot/")) {
    const cameraPort = settings.get("camera.port", 8081)
    try {
      const proxyUrl = `http://localhost:${cameraPort}${request.url}`
      const proxyRes = await fetch(proxyUrl)
      response.writeHead(proxyRes.status, {
        "Content-Type": proxyRes.headers.get("Content-Type") || "application/octet-stream",
      })
      const reader = proxyRes.body?.getReader()
      if (reader) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            response.write(value)
          }
          response.end()
        }
        pump().catch(() => response.end())
      } else {
        const buf = Buffer.from(await proxyRes.arrayBuffer())
        response.end(buf)
      }
    } catch {
      response.writeHead(502, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "Camera service unavailable" }))
    }
    return
  }

  response.writeHead(404, { "Content-Type": "text/plain" })
  response.end("Not found")
})

async function schedulerTick() {
  try {
    const fixChanged = lastFixState !== state.gnss.fix
    lastFixState = state.gnss.fix
    await sendHeartbeat()
    await sendTelemetry(fixChanged)
    await flushOutbox()
  } catch (error) {
    markBackendFailure(error)
  }
}

// ---- Startup Sequence ----

async function initHardware() {
  addLog("Starting hardware discovery...")
  try {
    hardwareManifest = await discover()
    addLog(`Hardware: profile=${hardwareManifest.profile}, cameras=${hardwareManifest.cameras.length}, gps=${hardwareManifest.gps.found} (${hardwareManifest.gps.source || "none"}), 4g=${hardwareManifest.sim7600.found}`)
    addLog(`Platform: ${hardwareManifest.platform.model} (${hardwareManifest.platform.ramMb}MB RAM)`)
    // Use auto-detected GPS port if found
    if (hardwareManifest.gps.found) {
      config.gpsPort = hardwareManifest.gps.port
      config.gpsBaud = hardwareManifest.gps.source === "SIM7600" ? 115200 : 9600
      state.serial.path = config.gpsPort
      state.gnss.source = hardwareManifest.gps.source
      addLog(`GPS: using ${hardwareManifest.gps.source} on ${config.gpsPort} @ ${config.gpsBaud}`)
    }
  } catch (error) {
    addLog(`Hardware discovery failed: ${error.message}`)
    hardwareManifest = { profile: "unknown", capabilities: {} }
  }
}

async function initModem() {
  if (!hardwareManifest?.sim7600?.found) {
    addLog("SIM7600 not detected — skipping modem init")
    return
  }

  sim7600Instance = new Sim7600({
    atPort: hardwareManifest.sim7600.atPort,
    enableGps: settings.get("modem.enableGps", true),
    onLog: addLog,
  })

  const ok = await sim7600Instance.init()
  if (ok) {
    addLog("SIM7600 modem initialized")
    // Use SIM7600 for GPS when modem GPS is enabled and NMEA port is available
    if (sim7600Instance.gpsEnabled && hardwareManifest.sim7600.hasNmea) {
      config.gpsPort = hardwareManifest.sim7600.nmeaPort || "/dev/ttyUSB1"
      config.gpsBaud = 115200
      state.serial.path = config.gpsPort
      state.gnss.source = "SIM7600"
      addLog(`GPS: using SIM7600 NMEA on ${config.gpsPort} @ 115200`)
    }
    // Try setting up cellular data
    if (settings.get("modem.enableCellular", true)) {
      await sim7600Instance.setupCellularData()
    }
  }
}

function registerModules() {
  // GPS module (built-in)
  moduleManager.registerBuiltin("gps", {
    enabled: settings.get("modules.gps", true) && (hardwareManifest?.capabilities?.hasGps || config.gpsOnline),
    start: () => { openSerial() },
    stop: () => {
      if (serialPort && serialPort.isOpen) {
        serialPort.close()
      }
    },
    health: () => ({
      connected: state.serial.connected,
      fix: state.gnss.fix,
      statusText: state.gnss.statusText,
      lat: state.gnss.lat,
      lon: state.gnss.lon,
    }),
  })

  // Herm sync module (built-in)
  moduleManager.registerBuiltin("herm-sync", {
    enabled: settings.get("modules.hermSync", true) && Boolean(config.deviceSecret),
    start: () => { addLog("Herm sync module active") },
    health: () => ({
      backendReachable: state.connection.backendReachable,
      lastHeartbeatAt: state.connection.lastHeartbeatAt,
      outboxDepth: state.connection.outboxDepth,
    }),
  })

  // SIM7600 modem module (built-in)
  if (hardwareManifest?.sim7600?.found) {
    moduleManager.registerBuiltin("modem", {
      enabled: settings.get("modules.modem", true),
      start: () => initModem(),
      health: () => sim7600Instance ? sim7600Instance.getStatus() : { ready: false },
    })
  }

  // Camera service (child process — Python)
  // Disabled — using direct ffmpeg capture + HTTP relay instead.
  // plate_watch C++ binary will replace this when compiled.
  // if (settings.get("modules.camera", true)) { ... }
}

async function startup() {
  await initHardware()
  registerModules()
  await moduleManager.startAll()
  addLog(`Modules started: ${moduleManager.status().filter((m) => m.state === "running").map((m) => m.name).join(", ") || "none"}`)

  // Try plate_watch first (has license plate detection + overlays)
  const plateWatchBinary = findPlateWatchBinary()
  if (plateWatchBinary) {
    addLog(`Found plate_watch binary: ${plateWatchBinary}`)
    startPlateWatch()
  } else {
    addLog("plate_watch not found — using plain ffmpeg (no plate detection)")
    startDirectCapture()
  }
}

fs.mkdirSync(config.outboxDir, { recursive: true })
refreshOutboxStats()
updateSystemStats().catch((error) => addLog(`System stats init failed: ${error.message}`))
setInterval(() => {
  updateSystemStats().catch((error) => addLog(`System stats failed: ${error.message}`))
}, config.systemPollIntervalMs)
setInterval(() => {
  schedulerTick().catch((error) => addLog(`Scheduler failed: ${error.message}`))
}, 1000)
setInterval(() => {
  flushOutbox().catch((error) => addLog(`Outbox flush failed: ${error.message}`))
}, config.outboxFlushIntervalMs)

// Frame push loop — Realtime every 150ms (~7fps), DB every 2s
addLog(`Frame relay config: apiBaseUrl=${config.apiBaseUrl}, hasSecret=${config.deviceSecret.length > 0}, realtime=${FRAME_PUSH_INTERVAL_MS}ms, db=${DB_PUSH_INTERVAL_MS}ms`)
setInterval(() => {
  pushCameraFrames().catch((err) => addLog(`Frame push crash: ${err.message}`))
}, FRAME_PUSH_INTERVAL_MS)

// Plate polling loop — every 2s, check plate_watch for new detections
setInterval(() => {
  pollPlates().catch((err) => addLog(`Plate poll crash: ${err.message}`))
}, PLATE_POLL_INTERVAL_MS)

// Run hardware discovery and module startup
startup().catch((error) => addLog(`Startup failed: ${error.message}`))

server.listen(config.port, "0.0.0.0", () => {
  addLog(
    `Herm Pi runtime listening on http://0.0.0.0:${config.port} (sync -> ${config.apiBaseUrl})`
  )
})
