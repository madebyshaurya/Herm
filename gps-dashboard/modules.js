/**
 * Herm Module Manager
 *
 * Manages feature modules as a plugin system. Each module can be:
 * - Built-in (runs in the same process, like GPS parser)
 * - Child-process (spawned as a separate process, like the Python camera service)
 *
 * Modules are auto-enabled based on hardware discovery results.
 */

const { spawn } = require("child_process")
const path = require("path")

const MODULE_STATES = {
  DISABLED: "disabled",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  CRASHED: "crashed",
  ERROR: "error",
}

class Module {
  constructor(name, config = {}) {
    this.name = name
    this.type = config.type || "builtin" // "builtin" | "child-process"
    this.enabled = config.enabled ?? false
    this.state = MODULE_STATES.DISABLED
    this.lastError = null
    this.startedAt = null
    this.crashCount = 0
    this.maxCrashRetries = config.maxCrashRetries ?? 5
    this.restartDelayMs = config.restartDelayMs ?? 3000
    this._process = null
    this._restartTimer = null
    this._startFn = config.start || null
    this._stopFn = config.stop || null
    this._healthFn = config.health || null
    this._onLog = config.onLog || console.log
  }

  async start() {
    if (this.state === MODULE_STATES.RUNNING || this.state === MODULE_STATES.STARTING) return
    this.state = MODULE_STATES.STARTING
    this.lastError = null

    try {
      if (this._startFn) {
        await this._startFn()
      }
      this.state = MODULE_STATES.RUNNING
      this.startedAt = Date.now()
      this.crashCount = 0
      this._onLog(`Module '${this.name}' started`)
    } catch (error) {
      this.state = MODULE_STATES.ERROR
      this.lastError = error.message
      this._onLog(`Module '${this.name}' failed to start: ${error.message}`)
    }
  }

  async stop() {
    if (this.state === MODULE_STATES.STOPPED || this.state === MODULE_STATES.DISABLED) return
    this.state = MODULE_STATES.STOPPING

    if (this._restartTimer) {
      clearTimeout(this._restartTimer)
      this._restartTimer = null
    }

    try {
      if (this._stopFn) {
        await this._stopFn()
      }
      if (this._process) {
        this._process.kill("SIGTERM")
        this._process = null
      }
    } catch {
      // best effort
    }

    this.state = MODULE_STATES.STOPPED
    this._onLog(`Module '${this.name}' stopped`)
  }

  health() {
    if (this._healthFn) {
      return { name: this.name, state: this.state, ...this._healthFn() }
    }
    return { name: this.name, state: this.state, lastError: this.lastError, crashCount: this.crashCount }
  }

  _scheduleRestart() {
    if (this.crashCount >= this.maxCrashRetries) {
      this.state = MODULE_STATES.CRASHED
      this._onLog(`Module '${this.name}' crashed too many times (${this.crashCount}), giving up`)
      return
    }

    const delay = Math.min(this.restartDelayMs * Math.pow(2, this.crashCount), 60000)
    this._onLog(`Module '${this.name}' restarting in ${delay}ms (crash #${this.crashCount})`)
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null
      this.start().catch(() => {})
    }, delay)
  }
}

class ChildProcessModule extends Module {
  constructor(name, config = {}) {
    super(name, { ...config, type: "child-process" })
    this.command = config.command || "python3"
    this.args = config.args || []
    this.cwd = config.cwd || process.cwd()
    this.env = config.env || {}
    this.port = config.port || null
    this._stdout = []
    this._stderr = []
  }

  async start() {
    if (this.state === MODULE_STATES.RUNNING || this.state === MODULE_STATES.STARTING) return
    this.state = MODULE_STATES.STARTING
    this.lastError = null
    this._stdout = []
    this._stderr = []

    try {
      this._process = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: { ...process.env, ...this.env },
        stdio: ["ignore", "pipe", "pipe"],
      })

      this._process.stdout.on("data", (data) => {
        const line = data.toString().trim()
        if (line) {
          this._stdout.push(line)
          if (this._stdout.length > 100) this._stdout.shift()
          this._onLog(`[${this.name}] ${line}`)
        }
      })

      this._process.stderr.on("data", (data) => {
        const line = data.toString().trim()
        if (line) {
          this._stderr.push(line)
          if (this._stderr.length > 100) this._stderr.shift()
        }
      })

      this._process.on("exit", (code, signal) => {
        this._process = null
        if (this.state === MODULE_STATES.STOPPING) {
          this.state = MODULE_STATES.STOPPED
          return
        }
        this.crashCount++
        this.lastError = `Process exited with code ${code} signal ${signal}`
        this._onLog(`Module '${this.name}' exited: code=${code} signal=${signal}`)
        this._scheduleRestart()
      })

      this._process.on("error", (error) => {
        this._process = null
        this.crashCount++
        this.lastError = error.message
        this.state = MODULE_STATES.ERROR
        this._onLog(`Module '${this.name}' error: ${error.message}`)
        this._scheduleRestart()
      })

      // Wait briefly to see if process crashes immediately
      await new Promise((resolve) => setTimeout(resolve, 1000))

      if (this._process && !this._process.killed) {
        this.state = MODULE_STATES.RUNNING
        this.startedAt = Date.now()
        this.crashCount = 0
        this._onLog(`Module '${this.name}' started (PID: ${this._process.pid})`)
      } else {
        throw new Error("Process exited immediately")
      }
    } catch (error) {
      this.state = MODULE_STATES.ERROR
      this.lastError = error.message
      this._onLog(`Module '${this.name}' failed to start: ${error.message}`)
    }
  }

  async stop() {
    this.state = MODULE_STATES.STOPPING
    if (this._restartTimer) {
      clearTimeout(this._restartTimer)
      this._restartTimer = null
    }

    if (this._process) {
      this._process.kill("SIGTERM")
      // Wait up to 5s for graceful exit
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this._process) {
            this._process.kill("SIGKILL")
          }
          resolve()
        }, 5000)
        if (this._process) {
          this._process.on("exit", () => {
            clearTimeout(timeout)
            resolve()
          })
        } else {
          clearTimeout(timeout)
          resolve()
        }
      })
      this._process = null
    }

    this.state = MODULE_STATES.STOPPED
    this._onLog(`Module '${this.name}' stopped`)
  }

  health() {
    return {
      name: this.name,
      type: "child-process",
      state: this.state,
      pid: this._process?.pid || null,
      port: this.port,
      crashCount: this.crashCount,
      lastError: this.lastError,
      recentOutput: this._stdout.slice(-5),
    }
  }
}

class ModuleManager {
  constructor(options = {}) {
    this.modules = new Map()
    this.onLog = options.onLog || console.log
  }

  register(name, module) {
    this.modules.set(name, module)
    return module
  }

  registerBuiltin(name, config) {
    const mod = new Module(name, { ...config, onLog: this.onLog })
    this.modules.set(name, mod)
    return mod
  }

  registerChildProcess(name, config) {
    const mod = new ChildProcessModule(name, { ...config, onLog: this.onLog })
    this.modules.set(name, mod)
    return mod
  }

  get(name) {
    return this.modules.get(name)
  }

  async startAll() {
    const startable = [...this.modules.values()].filter((m) => m.enabled)
    await Promise.all(startable.map((m) => m.start()))
  }

  async stopAll() {
    await Promise.all([...this.modules.values()].map((m) => m.stop()))
  }

  async enableAndStart(name) {
    const mod = this.modules.get(name)
    if (mod) {
      mod.enabled = true
      await mod.start()
    }
  }

  async disableAndStop(name) {
    const mod = this.modules.get(name)
    if (mod) {
      mod.enabled = false
      await mod.stop()
    }
  }

  healthAll() {
    const result = {}
    for (const [name, mod] of this.modules) {
      result[name] = mod.health()
    }
    return result
  }

  status() {
    return [...this.modules.entries()].map(([name, mod]) => ({
      name,
      enabled: mod.enabled,
      state: mod.state,
    }))
  }
}

module.exports = { Module, ChildProcessModule, ModuleManager, MODULE_STATES }
