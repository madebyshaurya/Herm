/**
 * Herm Hardware Discovery Module
 *
 * Auto-detects connected hardware on Raspberry Pi:
 * - CSI cameras (via picamera2 / libcamera)
 * - USB cameras (via V4L2 capability check)
 * - ArduCam / GPIO / I2C cameras
 * - GPS serial ports (/dev/ttyUSB*, /dev/ttyAMA*)
 * - SIM7600 4G HAT (/dev/ttyUSB2)
 * - Audio devices (/dev/snd/*)
 * - Network interfaces (WiFi, cellular wwan0)
 * - GPIO pin states
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

// Known non-camera V4L2 device identifiers (modem, ISP metadata, etc.)
const NON_CAMERA_DRIVERS = [
  "uvcvideo",       // may or may not be camera — check caps
  "bcm2835-codec",  // Pi hardware codec (not a camera)
  "bcm2835-isp",    // Pi ISP (not a camera input)
  "vivid",          // Virtual test device
]
const NON_CAMERA_CARDS = [
  "bcm2835-codec",
  "bcm2835-isp",
  "simcom",         // SIM7600 modem video
  "qmi_wwan",
]

async function detectCsiCameras() {
  const cameras = []

  // Method 1: picamera2 (preferred, works on both Pi 3 & 4)
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
          api: "picamera2",
          location: cam.Location || null,
          rotation: cam.Rotation || 0,
        })
      }
    } catch {
      // picamera2 not available or no cameras
    }
  }

  // Method 2: libcamera-hello (fallback if picamera2 not installed)
  if (cameras.length === 0) {
    const libcam = await run("libcamera-hello --list-cameras 2>&1 | grep -E '^[0-9]'", 5000)
    if (libcam) {
      for (const line of libcam.split("\n").filter(Boolean)) {
        const match = line.match(/^(\d+)\s*:\s*(\S+)/)
        if (match) {
          cameras.push({
            type: "csi",
            id: parseInt(match[1]),
            model: match[2],
            path: `/dev/video${match[1]}`,
            api: "libcamera",
          })
        }
      }
    }
  }

  // Method 3: vcgencmd (legacy raspivid stack)
  if (cameras.length === 0) {
    const vcgen = await run("vcgencmd get_camera 2>/dev/null")
    if (vcgen && vcgen.includes("detected=1")) {
      cameras.push({
        type: "csi",
        id: 0,
        model: "legacy-raspicam",
        path: "/dev/video0",
        api: "raspivid",
      })
    }
  }

  return cameras
}

async function detectUsbCameras() {
  const cameras = []
  const devices = await run("ls /dev/video* 2>/dev/null")
  if (!devices) return cameras

  for (const dev of devices.split("\n").filter(Boolean)) {
    // Get full V4L2 device info including driver, card, bus, capabilities
    const info = await run(`v4l2-ctl --device=${dev} --all 2>/dev/null | head -20`)
    if (!info) continue

    // Must support VIDEO_CAPTURE (single-plane or multi-plane)
    const hasCap = info.includes("Video Capture") && !info.includes("Video Capture Multiplanar only")
    const hasMultiCap = info.includes("Video Capture Multiplanar")
    if (!hasCap && !hasMultiCap) continue

    const driver = info.match(/Driver name\s*:\s*(.*)/)?.[1]?.trim() || ""
    const card = info.match(/Card type\s*:\s*(.*)/)?.[1]?.trim() || ""
    const bus = info.match(/Bus info\s*:\s*(.*)/)?.[1]?.trim() || ""

    // Filter out known non-camera devices
    const isNonCamera = NON_CAMERA_CARDS.some(nc => card.toLowerCase().includes(nc.toLowerCase()))
    if (isNonCamera) continue

    // Filter out ISP and codec nodes (Pi internal processing, not actual cameras)
    if (driver === "bcm2835-codec" || driver === "bcm2835-isp") continue

    // Determine interface type from bus info
    let iface = "usb"
    if (bus.includes("platform") || bus.includes("csi")) iface = "platform"
    if (bus.includes("usb")) iface = "usb"

    // Get supported formats
    const formats = await run(`v4l2-ctl --device=${dev} --list-formats 2>/dev/null | grep -E '\\[' | head -5`)

    cameras.push({
      type: "usb",
      id: dev,
      model: card || "USB Camera",
      path: dev,
      driver,
      bus,
      iface,
      formats: formats ? formats.split("\n").map(f => f.trim()).filter(Boolean) : [],
    })
  }
  return cameras
}

async function detectI2cCameras() {
  // Detect cameras on I2C bus (ArduCam, OV5647, IMX219, etc.)
  const cameras = []

  // Scan I2C buses for known camera module addresses
  const knownCameraI2C = {
    "0x10": "OV5647 / Pi Camera V1",
    "0x1a": "IMX219 / Pi Camera V2",
    "0x36": "IMX477 / Pi HQ Camera",
    "0x3c": "ArduCam / OV2640",
    "0x21": "OV5640",
    "0x30": "OV7670",
    "0x60": "OV2640 (alt)",
    "0x42": "MT9D111",
  }

  // Try I2C bus 0 and 10 (CSI ports), also bus 1 (GPIO I2C)
  for (const busNum of [0, 1, 10]) {
    const busPath = `/dev/i2c-${busNum}`
    if (!fileExists(busPath)) continue

    const scan = await run(`i2cdetect -y ${busNum} 2>/dev/null`, 3000)
    if (!scan) continue

    for (const [addr, name] of Object.entries(knownCameraI2C)) {
      const addrShort = addr.replace("0x", "")
      // i2cdetect shows addresses as 2-digit hex without 0x prefix
      if (scan.includes(addrShort)) {
        cameras.push({
          type: "i2c",
          id: `i2c-${busNum}-${addr}`,
          model: name,
          bus: busNum,
          address: addr,
        })
      }
    }
  }

  return cameras
}

async function detectGpioState() {
  // Read GPIO pin states relevant to camera/HAT connections
  const gpioInfo = { pins: {}, cameraEnable: false }

  // Check if GPIO is accessible
  const gpioChip = fileExists("/dev/gpiochip0")
  if (!gpioChip) return gpioInfo

  // Use gpioinfo to list all GPIO lines and their states
  const gpioList = await run("gpioinfo gpiochip0 2>/dev/null | head -30", 3000)
  if (gpioList) {
    // Camera-related GPIO pins on Pi:
    // GPIO 0-1: I2C (camera comms), GPIO 2-3: I2C1
    // GPIO 4: GPCLK0 (camera clock), GPIO 5: CAM_GPIO (camera LED/enable)
    // GPIO 32-33: CAM0/CAM1 on compute module
    const cameraLines = gpioList.split("\n").filter(line =>
      line.includes("CAM") || line.includes("cam") ||
      line.match(/line\s+[0-5]:/) || line.match(/line\s+3[2-3]:/)
    )

    for (const line of cameraLines) {
      const match = line.match(/line\s+(\d+):\s+"([^"]*)".*\[(.+)\]/)
      if (match) {
        gpioInfo.pins[`gpio${match[1]}`] = {
          name: match[2] || `GPIO${match[1]}`,
          state: match[3].trim(),
        }
      }
    }
  }

  // Check CSI interface status via device tree
  const csi0 = await run("cat /proc/device-tree/csi*/status 2>/dev/null || echo disabled")
  gpioInfo.cameraEnable = csi0.includes("okay") || csi0.includes("ok")

  // Check if camera interface is enabled in boot config
  const bootConfig = await run("cat /boot/config.txt /boot/firmware/config.txt 2>/dev/null | grep -iE 'camera|csi|arducam|imx|ov5647'")
  gpioInfo.bootConfig = bootConfig ? bootConfig.split("\n").filter(Boolean) : []

  return gpioInfo
}

async function detectGpsSerial() {
  // Prefer standalone UART GPS first — 4G SIM is optional
  const candidates = [
    { port: "/dev/ttyAMA0", source: "UART" },   // Pi built-in UART (most common for standalone GPS)
    { port: "/dev/ttyS0",   source: "UART" },   // Alternate UART
    { port: "/dev/ttyUSB1", source: "SIM7600" }, // SIM7600 NMEA port (only if 4G hat present)
    { port: "/dev/ttyUSB0", source: "USB" },     // Generic USB GPS receiver
  ]

  for (const { port, source } of candidates) {
    if (fileExists(port)) {
      return { found: true, port, source }
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
  const [platform, csiCameras, usbCameras, i2cCameras, gps, sim7600, audio, network, gpio] = await Promise.all([
    detectPlatform(),
    detectCsiCameras(),
    detectUsbCameras(),
    detectI2cCameras(),
    detectGpsSerial(),
    detectSim7600(),
    detectAudio(),
    detectNetwork(),
    detectGpioState(),
  ])

  // Merge cameras — deduplicate CSI cameras that also appear in USB/V4L2 list
  const csiPaths = new Set(csiCameras.map(c => c.path))
  const dedupedUsb = usbCameras.filter(c => !csiPaths.has(c.path))
  const cameras = [...csiCameras, ...dedupedUsb]

  // If SIM7600 is detected with NMEA capability, prefer it for GPS.
  // On Pi 3B+, /dev/ttyAMA0 exists but is Bluetooth (not GPS).
  // The GPS antenna connects to the SIM7600 HAT's GNSS pin.
  let effectiveGps = gps
  if (sim7600.found && sim7600.hasNmea) {
    effectiveGps = { found: true, port: sim7600.nmeaPort, source: "SIM7600" }
  }

  // Auto-detect device profile — GPS works independently of 4G SIM
  let profile = process.env.HERM_DEVICE_PROFILE || "auto"
  if (profile === "auto") {
    if (effectiveGps.found && cameras.length >= 1) {
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
    i2cCameras,
    gps: effectiveGps,
    sim7600,
    audio,
    network,
    gpio,
    capabilities: {
      hasCamera: cameras.length > 0,
      hasCsi: csiCameras.length > 0,
      hasUsb: dedupedUsb.length > 0,
      hasI2cCamera: i2cCameras.length > 0,
      hasGps: effectiveGps.found,
      has4g: sim7600.found,
      hasSpeaker: audio.speakers.length > 0,
      hasMicrophone: audio.microphones.length > 0,
      hasCellular: network.hasCellular,
      cameraCount: cameras.length,
      csiEnabled: gpio.cameraEnable,
    },
  }
}

module.exports = { discover }
