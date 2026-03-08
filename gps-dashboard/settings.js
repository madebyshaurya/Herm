/**
 * Herm Settings System
 *
 * Manages device settings stored in /etc/herm/settings.json.
 * Settings are persisted across reboots and can be updated via:
 * - Local API (POST /api/settings)
 * - Web portal (pushed via heartbeat response)
 * - Manual file edit
 */

const fs = require("fs")
const path = require("path")

const DEFAULT_SETTINGS_PATH = "/etc/herm/settings.json"

const DEFAULTS = {
  device: {
    profile: "auto", // auto | full | watcher
    name: "",
    staticLat: null,  // for watcher devices without GPS
    staticLon: null,
  },
  camera: {
    enabled: true,
    resolution: [640, 480],
    fps: 15,
    detectionConfidence: 0.4,
    detectionInterval: 0.5,
    dedupWindow: 30,
    streamQuality: 70,
  },
  gps: {
    enabled: true,
    serialPort: "auto", // auto-detected at startup (UART, USB, or SIM7600)
    baudRate: 9600,     // standard NMEA baud; overridden to 115200 if SIM7600
  },
  modem: {
    enabled: true,
    atPort: "/dev/ttyUSB2",
    enableGps: true,    // enable SIM7600 GPS by default (GPS antenna is on the HAT)
    enableCellular: true,
    apn: "internet",
  },
  sync: {
    heartbeatIntervalSec: 60,
    telemetryIntervalSec: 5,
    apiBaseUrl: "https://hermai.xyz",
  },
  modules: {
    gps: true,
    camera: true,
    modem: true,
    hermSync: true,
  },
}

class Settings {
  constructor(filePath) {
    this.filePath = filePath || process.env.HERM_SETTINGS_PATH || DEFAULT_SETTINGS_PATH
    this.data = JSON.parse(JSON.stringify(DEFAULTS))
    this._watchers = []
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8")
        const saved = JSON.parse(raw)
        this.data = this._deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), saved)
      }
    } catch (error) {
      console.error(`Settings load failed: ${error.message}, using defaults`)
    }
    return this.data
  }

  save() {
    try {
      const dir = path.dirname(this.filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch (error) {
      console.error(`Settings save failed: ${error.message}`)
    }
  }

  get(keyPath, fallback) {
    const keys = keyPath.split(".")
    let current = this.data
    for (const key of keys) {
      if (current == null || typeof current !== "object") return fallback
      current = current[key]
    }
    return current !== undefined ? current : fallback
  }

  set(keyPath, value) {
    const keys = keyPath.split(".")
    let current = this.data
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] == null || typeof current[keys[i]] !== "object") {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    const oldValue = current[keys[keys.length - 1]]
    current[keys[keys.length - 1]] = value
    if (oldValue !== value) {
      this._notifyWatchers(keyPath, value, oldValue)
    }
    return this
  }

  update(patch) {
    const changes = []
    this._applyPatch(this.data, patch, "", changes)
    for (const change of changes) {
      this._notifyWatchers(change.path, change.newValue, change.oldValue)
    }
    return changes
  }

  onChange(callback) {
    this._watchers.push(callback)
    return () => {
      this._watchers = this._watchers.filter((w) => w !== callback)
    }
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.data))
  }

  _notifyWatchers(keyPath, newValue, oldValue) {
    for (const watcher of this._watchers) {
      try {
        watcher(keyPath, newValue, oldValue)
      } catch {
        // Don't let watcher errors break the settings system
      }
    }
  }

  _applyPatch(target, patch, prefix, changes) {
    for (const [key, value] of Object.entries(patch)) {
      const fullPath = prefix ? `${prefix}.${key}` : key
      if (value != null && typeof value === "object" && !Array.isArray(value) && target[key] != null && typeof target[key] === "object") {
        this._applyPatch(target[key], value, fullPath, changes)
      } else {
        const oldValue = target[key]
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
          changes.push({ path: fullPath, oldValue, newValue: value })
        }
        target[key] = value
      }
    }
  }

  _deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (value != null && typeof value === "object" && !Array.isArray(value) && target[key] != null && typeof target[key] === "object") {
        target[key] = this._deepMerge(target[key], value)
      } else {
        target[key] = value
      }
    }
    return target
  }
}

module.exports = { Settings, DEFAULTS }
