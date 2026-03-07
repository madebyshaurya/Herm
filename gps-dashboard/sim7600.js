/**
 * Herm SIM7600 4G HAT Initialization
 *
 * The SIM7600 requires AT commands before GPS and cellular data work:
 * - AT+CGPS=1 to enable GPS NMEA output on /dev/ttyUSB1
 * - AT+CGDCONT/AT+CGACT for cellular data (or QMI/PPP)
 *
 * This module handles modem initialization and monitoring.
 */

const fs = require("fs")

let SerialPort
try {
  SerialPort = require("serialport").SerialPort
} catch {
  // serialport not installed — will fail gracefully
}

const DEFAULT_AT_PORT = "/dev/ttyUSB2"
const AT_TIMEOUT = 5000
const INIT_RETRY_DELAY = 3000
const MAX_RETRIES = 5

class Sim7600 {
  constructor(options = {}) {
    this.atPort = options.atPort || DEFAULT_AT_PORT
    this.baudRate = options.baudRate || 115200
    this.port = null
    this.buffer = ""
    this.ready = false
    this.gpsEnabled = false
    this.cellularConnected = false
    this.signalStrength = null
    this.operatorName = null
    this.imei = null
    this.lastError = null
    this.onLog = options.onLog || console.log
  }

  async init() {
    if (!SerialPort) {
      this.lastError = "serialport module not available"
      this.onLog(`SIM7600: ${this.lastError}`)
      return false
    }

    if (!fs.existsSync(this.atPort)) {
      this.lastError = `AT port ${this.atPort} not found`
      this.onLog(`SIM7600: ${this.lastError}`)
      return false
    }

    try {
      await this._openPort()
      await this._initialize()
      this.ready = true
      return true
    } catch (error) {
      this.lastError = error.message
      this.onLog(`SIM7600 init failed: ${error.message}`)
      return false
    }
  }

  _openPort() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.atPort,
        baudRate: this.baudRate,
        autoOpen: false,
      })

      this.port.on("data", (data) => {
        this.buffer += data.toString()
      })

      this.port.on("error", (err) => {
        this.lastError = err.message
        this.onLog(`SIM7600 serial error: ${err.message}`)
      })

      this.port.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async _sendAT(command, waitMs = AT_TIMEOUT) {
    if (!this.port || !this.port.isOpen) {
      throw new Error("Port not open")
    }

    this.buffer = ""

    return new Promise((resolve, reject) => {
      this.port.write(`${command}\r\n`, (err) => {
        if (err) return reject(err)
      })

      const deadline = Date.now() + waitMs
      const check = setInterval(() => {
        if (this.buffer.includes("OK") || this.buffer.includes("ERROR")) {
          clearInterval(check)
          const response = this.buffer.trim()
          this.buffer = ""
          if (response.includes("ERROR")) {
            reject(new Error(`AT command '${command}' returned ERROR: ${response}`))
          } else {
            resolve(response)
          }
        } else if (Date.now() > deadline) {
          clearInterval(check)
          const partial = this.buffer.trim()
          this.buffer = ""
          reject(new Error(`AT command '${command}' timed out. Partial: ${partial}`))
        }
      }, 100)
    })
  }

  async _initialize() {
    // Basic modem check
    await this._sendAT("AT")
    this.onLog("SIM7600: Modem responding")

    // Get modem info
    try {
      const ati = await this._sendAT("ATI")
      this.onLog(`SIM7600: ${ati.split("\n").find((l) => l.includes("SIM")) || "Modem identified"}`)
    } catch {
      // Non-critical
    }

    // Get IMEI
    try {
      const imeiResp = await this._sendAT("AT+CGSN")
      const imeiMatch = imeiResp.match(/(\d{15})/)
      if (imeiMatch) this.imei = imeiMatch[1]
    } catch {
      // Non-critical
    }

    // Only enable SIM7600's built-in GPS if explicitly requested (standalone GPS is preferred)
    if (this.options?.enableGps !== false) {
      await this.enableGps()
    } else {
      this.onLog("SIM7600: GPS via modem skipped (standalone GPS preferred)")
    }

    // Check cellular registration
    await this.checkCellular()
  }

  async enableGps() {
    try {
      // Check current GPS state
      const gpsInfo = await this._sendAT("AT+CGPS?")
      if (gpsInfo.includes("+CGPS: 1")) {
        this.gpsEnabled = true
        this.onLog("SIM7600: GPS already enabled")
        return true
      }

      // Enable GPS
      await this._sendAT("AT+CGPS=1", 10000)
      this.gpsEnabled = true
      this.onLog("SIM7600: GPS enabled — NMEA output on modem serial port")
      return true
    } catch (error) {
      this.onLog(`SIM7600: Failed to enable GPS: ${error.message}`)
      this.gpsEnabled = false
      return false
    }
  }

  async checkCellular() {
    try {
      // Check network registration
      const creg = await this._sendAT("AT+CREG?")
      const registered = creg.includes(",1") || creg.includes(",5") // Home or roaming

      // Get signal strength
      const csq = await this._sendAT("AT+CSQ")
      const csqMatch = csq.match(/\+CSQ:\s*(\d+)/)
      if (csqMatch) {
        this.signalStrength = parseInt(csqMatch[1])
      }

      // Get operator name
      try {
        const cops = await this._sendAT("AT+COPS?")
        const opsMatch = cops.match(/"(.+?)"/)
        if (opsMatch) this.operatorName = opsMatch[1]
      } catch {
        // Non-critical
      }

      this.cellularConnected = registered
      this.onLog(
        `SIM7600: Cellular ${registered ? "registered" : "not registered"}, ` +
          `signal: ${this.signalStrength ?? "?"}/31` +
          (this.operatorName ? `, operator: ${this.operatorName}` : "")
      )
      return registered
    } catch (error) {
      this.onLog(`SIM7600: Cellular check failed: ${error.message}`)
      return false
    }
  }

  async setupCellularData() {
    try {
      // Define PDP context — most carriers work with empty APN or "internet"
      await this._sendAT('AT+CGDCONT=1,"IP","internet"')
      // Activate PDP context
      await this._sendAT("AT+CGACT=1,1", 15000)
      this.onLog("SIM7600: Cellular data PDP context activated")

      // Alternative: use QMI if available
      // exec("sudo qmicli -d /dev/cdc-wdm0 --dms-get-operating-mode")
      return true
    } catch (error) {
      this.onLog(`SIM7600: Cellular data setup failed: ${error.message}`)
      return false
    }
  }

  async getGpsInfo() {
    try {
      const info = await this._sendAT("AT+CGPSINFO")
      return info
    } catch {
      return null
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      gpsEnabled: this.gpsEnabled,
      cellularConnected: this.cellularConnected,
      signalStrength: this.signalStrength,
      operatorName: this.operatorName,
      imei: this.imei,
      lastError: this.lastError,
    }
  }

  async close() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.ready = false
          resolve()
        })
      })
    }
  }
}

module.exports = { Sim7600 }
