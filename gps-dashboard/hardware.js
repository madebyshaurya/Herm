/**
 * Herm Hardware Discovery Module
 *
 * Auto-detects connected hardware on Raspberry Pi:
 * - CSI cameras (via picamera2)
 * - USB cameras (via /dev/video*)
 * - GPS serial ports (/dev/ttyUSB*, /dev/ttyAMA*)
 * - SIM7600 4G HAT (/dev/ttyUSB2)
 * - Audio devices (/dev/snd/*)
 * - Network interfaces (WiFi, cellular wwan0)
 */

const fs = require("fs")
const { exec } = require("child_process")

function run(command, timeoutMs = 5000) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs }, (error, stdout) => {
      resolve(error ? "" : stdout.trim())
    })
  })
}

function fileExists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

async function detectCsiCameras() {
  const cameras = []
  const raw = await run(
    `python3 -c "from picamera2 import Picamera2; import json; print(json.dumps(Picamera2.global_camera_info()))"`,
    8000
  )
  if (raw) {
    try {
      const info = JSON.parse(raw)
      for (const cam of info) {
        cameras.push({
          type: "csi",
          id: cam.Id || cam.Num || cameras.length,
          model: cam.Model || "unknown",
          path: cam.Id || `/dev/video${cameras.length}`,
        })
      }
    } catch {
      // picamera2 not available or no cameras
    }
  }
  return cameras
}

async function detectUsbCameras() {
  const cameras = []
  const devices = await run("ls /dev/video* 2>/dev/null")
  if (!devices) return cameras

  for (const dev of devices.split("\n").filter(Boolean)) {
    const caps = await run(`v4l2-ctl --device=${dev} --all 2>/dev/null | head -5`)
    if (caps.includes("Video Capture")) {
      cameras.push({
        type: "usb",
        id: dev,
        model: caps.match(/Card type\s*:\s*(.*)/)?.[1]?.trim() || "USB Camera",
        path: dev,
      })
    }
  }
  return cameras
}

async function detectGpsSerial() {
  const candidates = [
    "/dev/ttyUSB1", // SIM7600 NMEA port
    "/dev/ttyAMA0", // Pi built-in UART
    "/dev/ttyS0",   // Alternate UART
  ]

  for (const port of candidates) {
    if (fileExists(port)) {
      return { found: true, port, source: port === "/dev/ttyUSB1" ? "SIM7600" : "UART" }
    }
  }
  return { found: false, port: null, source: null }
}

async function detectSim7600() {
  const atPort = "/dev/ttyUSB2"
  const nmeaPort = "/dev/ttyUSB1"
  const dataPort = "/dev/ttyUSB3"

  if (!fileExists(atPort)) {
    return { found: false }
  }

  // Try to query modem
  const response = await run(
    `echo -e "ATI\\r" | timeout 3 socat - ${atPort},crnl 2>/dev/null`
  )

  return {
    found: true,
    atPort,
    nmeaPort,
    dataPort,
    model: response.includes("SIM7600") ? "SIM7600" : response.includes("SIM") ? "SIM-series" : "4G Modem",
    hasNmea: fileExists(nmeaPort),
    hasData: fileExists(dataPort),
  }
}

async function detectAudio() {
  const devices = { speakers: [], microphones: [] }

  const aplay = await run("aplay -l 2>/dev/null")
  if (aplay) {
    for (const line of aplay.split("\n")) {
      const match = line.match(/^card (\d+):.*\[(.+?)\]/)
      if (match) {
        devices.speakers.push({ card: parseInt(match[1]), name: match[2].trim() })
      }
    }
  }

  const arecord = await run("arecord -l 2>/dev/null")
  if (arecord) {
    for (const line of arecord.split("\n")) {
      const match = line.match(/^card (\d+):.*\[(.+?)\]/)
      if (match) {
        devices.microphones.push({ card: parseInt(match[1]), name: match[2].trim() })
      }
    }
  }

  return devices
}

async function detectNetwork() {
  const interfaces = {}
  const os = require("os")
  const nets = os.networkInterfaces()

  for (const [name, entries] of Object.entries(nets)) {
    const ipv4 = entries?.find((e) => e.family === "IPv4" && !e.internal)
    if (ipv4) {
      let type = "unknown"
      if (name.startsWith("wlan")) type = "wifi"
      else if (name.startsWith("eth")) type = "ethernet"
      else if (name.startsWith("wwan") || name.startsWith("usb")) type = "cellular"

      interfaces[name] = { type, address: ipv4.address, mac: ipv4.mac }
    }
  }

  // Check for cellular specifically
  const hasCellular = Object.values(interfaces).some((i) => i.type === "cellular")

  return { interfaces, hasCellular }
}

async function detectPlatform() {
  const model = await run("cat /proc/device-tree/model 2>/dev/null")
  const serial = await run("cat /proc/device-tree/serial-number 2>/dev/null")
  const mem = await run("free -m | awk 'NR==2{print $2}'")

  return {
    model: model || "Unknown",
    serial: serial || null,
    ramMb: parseInt(mem) || 0,
    isPi4: model.includes("Pi 4"),
    isPi3: model.includes("Pi 3"),
    arch: process.arch,
  }
}

/**
 * Run full hardware discovery. Returns a manifest of all detected hardware.
 */
async function discover() {
  const [platform, csiCameras, usbCameras, gps, sim7600, audio, network] = await Promise.all([
    detectPlatform(),
    detectCsiCameras(),
    detectUsbCameras(),
    detectGpsSerial(),
    detectSim7600(),
    detectAudio(),
    detectNetwork(),
  ])

  const cameras = [...csiCameras, ...usbCameras]

  // Auto-detect device profile
  let profile = process.env.HERM_DEVICE_PROFILE || "auto"
  if (profile === "auto") {
    if (sim7600.found && gps.found && cameras.length >= 2) {
      profile = "full"
    } else {
      profile = "watcher"
    }
  }

  return {
    discoveredAt: new Date().toISOString(),
    profile,
    platform,
    cameras,
    gps,
    sim7600,
    audio,
    network,
    capabilities: {
      hasCamera: cameras.length > 0,
      hasCsi: csiCameras.length > 0,
      hasUsb: usbCameras.length > 0,
      hasGps: gps.found,
      has4g: sim7600.found,
      hasSpeaker: audio.speakers.length > 0,
      hasMicrophone: audio.microphones.length > 0,
      hasCellular: network.hasCellular,
    },
  }
}

module.exports = { discover }
