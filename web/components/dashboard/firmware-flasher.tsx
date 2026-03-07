"use client"

import { useState, useCallback, useEffect } from "react"
import {
  IconDownload,
  IconLoader2,
  IconWifi,
  IconCpu,
  IconAlertCircle,
  IconSdk,
  IconRefresh,
  IconRocket,
  IconCircleCheck,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupMethod = "network" | "sd-card" | "download" | null
type SetupPhase =
  | "choose-profile"
  | "choose-method"
  | "wifi-config"
  | "network-scan"
  | "network-push"
  | "sd-write"
  | "download-image"
  | "done"
  | "error"

interface PiCandidate {
  address: string
  label: string
  source: "mdns" | "scan"
}

interface FirmwareFlasherProps {
  deviceId: string
  deviceName: string
  deviceSecret: string
  apiBaseUrl: string
  bootstrapUrl: string
  bundleUrl: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FirmwareFlasher({
  deviceId,
  deviceName,
  deviceSecret,
  apiBaseUrl,
  bootstrapUrl,
  bundleUrl,
}: FirmwareFlasherProps) {
  const [phase, setPhase] = useState<SetupPhase>("choose-profile")
  const [method, setMethod] = useState<SetupMethod>(null)
  const [profile, setProfile] = useState<"full" | "watcher">("full")
  const [wifiSsid, setWifiSsid] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [wifiCountry, setWifiCountry] = useState("US")
  const [candidates, setCandidates] = useState<PiCandidate[]>([])
  const [selectedPi, setSelectedPi] = useState<PiCandidate | null>(null)
  const [scanning, setScanning] = useState(false)
  const [pushStatus, setPushStatus] = useState<string>("")
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sdWritten, setSdWritten] = useState(false)

  // ---- Config generation (all stays client-side) ----

  const generateDeviceEnv = useCallback(() => {
    return [
      `HERM_API_BASE_URL='${apiBaseUrl}'`,
      `HERM_DEVICE_ID='${deviceId}'`,
      `HERM_DEVICE_NAME='${deviceName}'`,
      `HERM_DEVICE_SECRET='${deviceSecret}'`,
      `HERM_CAMERA_ONLINE='false'`,
      `HERM_GPS_ONLINE='true'`,
      `HERM_GPS_PORT='/dev/ttyUSB1'`,
      `HERM_GPS_BAUD='115200'`,
      `HERM_HEARTBEAT_INTERVAL_SEC='60'`,
      `HERM_TELEMETRY_INTERVAL_SEC='5'`,
      `HERM_LOCAL_PORT='3000'`,
      `HERM_DEVICE_PROFILE='${profile}'`,
    ].join("\n")
  }, [apiBaseUrl, deviceId, deviceName, deviceSecret, profile])

  const generateWifiConf = useCallback(() => {
    if (!wifiSsid) return ""
    return [
      `WIFI_SSID="${wifiSsid}"`,
      `WIFI_PASSWORD="${wifiPassword}"`,
      `WIFI_COUNTRY="${wifiCountry}"`,
    ].join("\n")
  }, [wifiSsid, wifiPassword, wifiCountry])

  // ---- Method 1: Network scan + wireless push ----

  const scanNetwork = useCallback(async () => {
    setScanning(true)
    setCandidates([])
    setError(null)
    try {
      const res = await fetch("/api/device/discover")
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || "Scan failed")
      setCandidates(data.candidates || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network scan failed")
    } finally {
      setScanning(false)
    }
  }, [])

  const pushToPi = useCallback(
    async (pi: PiCandidate) => {
      setSelectedPi(pi)
      setPhase("network-push")
      setPushStatus("Connecting…")
      setError(null)

      try {
        // Step 1: Push the bootstrap script to the Pi via the web server proxy
        setPushStatus("Sending setup command to Pi…")

        const res = await fetch("/api/device/push-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            piAddress: pi.address,
            deviceId,
            deviceSecret,
            bootstrapUrl: `${apiBaseUrl}${bootstrapUrl}`,
            wifiSsid: wifiSsid || undefined,
            wifiPassword: wifiPassword || undefined,
            wifiCountry: wifiCountry || undefined,
            profile,
          }),
        })

        const data = await res.json()
        if (!data.ok) throw new Error(data.error || "Push failed")

        setPushStatus("Setup sent! Pi is installing…")

        // Step 2: Poll for heartbeat
        setPushStatus("Waiting for Pi to connect…")
        let attempts = 0
        const maxAttempts = 60 // 5 minutes (check every 5s)

        const pollInterval = setInterval(async () => {
          attempts++
          try {
            const hbRes = await fetch(`/api/device/heartbeat-check?deviceId=${deviceId}`)
            const hbData = await hbRes.json()
            if (hbData.ok && hbData.online) {
              clearInterval(pollInterval)
              setPushStatus("")
              setPhase("done")
            }
          } catch {
            // keep polling
          }
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval)
            setPushStatus(
              "Pi hasn't connected yet. It may still be installing — check the Devices page in a few minutes."
            )
          }
        }, 5000)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to push setup to Pi")
        setPhase("error")
      }
    },
    [deviceId, deviceSecret, apiBaseUrl, bootstrapUrl, wifiSsid, wifiPassword, wifiCountry, profile]
  )

  // ---- Method 2: SD card (File System Access API) ----

  const writeToSdCard = useCallback(async () => {
    setPhase("sd-write")
    setError(null)
    setSdWritten(false)

    // Check if File System Access API is available
    if (!("showDirectoryPicker" in window)) {
      setError(
        "Your browser doesn't support direct SD card writing. Use Chrome or Edge, or use the Download method instead."
      )
      setPhase("error")
      return
    }

    try {
      // Let user pick the boot partition of the SD card
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "desktop",
      })

      setPushStatus("Writing config files to SD card…")

      // Create /herm directory on boot partition
      let hermDir: any
      try {
        hermDir = await dirHandle.getDirectoryHandle("herm", { create: true })
      } catch {
        setError("Couldn't create herm/ folder. Make sure you selected the boot partition of the SD card.")
        setPhase("error")
        return
      }

      // Write device.env
      const envHandle = await hermDir.getFileHandle("device.env", { create: true })
      const envWritable = await envHandle.createWritable()
      await envWritable.write(generateDeviceEnv())
      await envWritable.close()

      // Write wifi.conf (if configured)
      const wifiConf = generateWifiConf()
      if (wifiConf) {
        const wifiHandle = await hermDir.getFileHandle("wifi.conf", { create: true })
        const wifiWritable = await wifiHandle.createWritable()
        await wifiWritable.write(wifiConf)
        await wifiWritable.close()
      }

      // Write profile.conf
      const profileHandle = await hermDir.getFileHandle("profile.conf", { create: true })
      const profileWritable = await profileHandle.createWritable()
      await profileWritable.write(`DEVICE_PROFILE=${profile}`)
      await profileWritable.close()

      setSdWritten(true)
      setPushStatus("")
      setPhase("done")
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // User cancelled the picker
        setPhase("choose-method")
        return
      }
      setError(err instanceof Error ? err.message : "Failed to write to SD card")
      setPhase("error")
    }
  }, [generateDeviceEnv, generateWifiConf, profile])

  // ---- Method 3: Download everything ----

  const downloadAll = useCallback(async () => {
    setPhase("download-image")
    setProgress(0)
    setError(null)

    try {
      // Download firmware image via our proxy (user never sees GitHub)
      setPushStatus("Downloading Herm OS image…")
      const imgRes = await fetch("/api/firmware/latest")
      const imgData = await imgRes.json()

      if (imgData.downloadUrl) {
        // Start the download
        const link = document.createElement("a")
        link.href = imgData.downloadUrl
        link.download = imgData.fileName ?? "herm-firmware.tar.gz"
        link.click()
      }

      setPushStatus("Generating config bundle…")

      // Also download personalized config bundle
      const bundleContent = [
        "# ==============================================",
        `# Herm Config Bundle for: ${deviceName}`,
        `# Device ID: ${deviceId}`,
        `# Profile: ${profile}`,
        `# Generated: ${new Date().toISOString()}`,
        "# ==============================================",
        "",
        "# ---- /boot/herm/device.env ----",
        generateDeviceEnv(),
        "",
        generateWifiConf() ? "# ---- /boot/herm/wifi.conf ----" : "",
        generateWifiConf(),
        "",
        `# ---- /boot/herm/profile.conf ----`,
        `DEVICE_PROFILE=${profile}`,
        "",
        "# ==============================================",
        "# SETUP:",
        "# 1. Flash Raspberry Pi OS Lite (64-bit) to your SD card",
        "#    (Raspberry Pi Imager → Raspberry Pi OS Lite 64-bit)",
        "# 2. Boot the Pi, connect via SSH or run bootstrap:",
        `#    curl -fsSL '${apiBaseUrl}/api/device/setup/${deviceId}/bootstrap?secret=${deviceSecret}' | sudo bash`,
        "# 3. Reboot — Pi auto-configures and appears on dashboard",
        "# ==============================================",
      ]
        .filter(Boolean)
        .join("\n")

      const blob = new Blob([bundleContent], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `herm-config-${deviceName.toLowerCase().replace(/\s+/g, "-")}.txt`
      a.click()
      URL.revokeObjectURL(url)

      setPushStatus("")
      setPhase("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed")
      setPhase("error")
    }
  }, [deviceId, deviceName, profile, generateDeviceEnv, generateWifiConf])

  // ---- Render ----

  return (
    <Card className="border-border/70 bg-card/88">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconCpu className="h-5 w-5" />
              Set up {deviceName}
            </CardTitle>
            <CardDescription>
              Configure and install Herm on your Raspberry Pi — everything happens right here.
            </CardDescription>
          </div>
          {phase !== "choose-profile" && phase !== "done" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPhase("choose-profile")
                setMethod(null)
                setError(null)
                setPushStatus("")
              }}
            >
              Start over
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ---- Step 1: Device Profile ---- */}
        {phase === "choose-profile" && (
          <div className="space-y-4">
            <p className="text-sm font-medium">What type of device is this?</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setProfile("full")}
                className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                  profile === "full"
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-background/45 hover:border-border"
                }`}
              >
                <p className="font-semibold">Full Dashcam</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pi 4B — GPS + 4G + dual cameras. The main dashcam unit.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setProfile("watcher")}
                className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                  profile === "watcher"
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-background/45 hover:border-border"
                }`}
              >
                <p className="font-semibold">Watcher</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pi 3B+ — WiFi only, single camera. Watches for stolen plates.
                </p>
              </button>
            </div>

            {/* WiFi config inline */}
            <div className="space-y-3 rounded-lg border border-border/70 bg-background/45 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <IconWifi className="h-4 w-4" />
                WiFi (optional)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="wifi-ssid" className="text-xs text-muted-foreground">
                    Network
                  </Label>
                  <Input
                    id="wifi-ssid"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="MyWiFi"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wifi-pw" className="text-xs text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="wifi-pw"
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="wifi-cc" className="text-xs text-muted-foreground">
                    Country
                  </Label>
                  <Input
                    id="wifi-cc"
                    value={wifiCountry}
                    onChange={(e) => setWifiCountry(e.target.value.toUpperCase())}
                    placeholder="US"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <Button onClick={() => setPhase("choose-method")} className="w-full gap-2">
              <IconRocket className="h-4 w-4" />
              Continue
            </Button>
          </div>
        )}

        {/* ---- Step 2: Choose Setup Method ---- */}
        {phase === "choose-method" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">⚡ Prerequisite</p>
              <p>
                Your Pi needs{" "}
                <a
                  href="https://www.raspberrypi.com/software/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  Raspberry Pi OS (64-bit)
                </a>{" "}
                installed first. Use Raspberry Pi Imager to flash the OS, enable SSH, and set up WiFi.
                Then choose how to install Herm on top:
              </p>
            </div>
            <p className="text-sm font-medium">How do you want to install Herm?</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setMethod("network")
                  setPhase("network-scan")
                  scanNetwork()
                }}
                className="rounded-lg border border-border/70 bg-background/45 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <IconWifi className="mb-2 h-6 w-6 text-blue-400" />
                <p className="font-semibold">Wireless (Recommended)</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pi is booted and on your network. We&apos;ll find it and push setup wirelessly.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod("sd-card")
                  writeToSdCard()
                }}
                className="rounded-lg border border-border/70 bg-background/45 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <IconSdk className="mb-2 h-6 w-6 text-green-400" />
                <p className="font-semibold">SD Card Config</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Write Herm config files to the SD card&apos;s boot partition (OS must already be on it).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod("download")
                  downloadAll()
                }}
                className="rounded-lg border border-border/70 bg-background/45 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <IconDownload className="mb-2 h-6 w-6 text-purple-400" />
                <p className="font-semibold">Manual Install</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Download config + one-liner command to run on your Pi via SSH.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ---- Network: Scanning ---- */}
        {phase === "network-scan" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Raspberry Pis on your network</p>
              <Button variant="ghost" size="sm" onClick={scanNetwork} disabled={scanning}>
                <IconRefresh className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
                {scanning ? "Scanning…" : "Rescan"}
              </Button>
            </div>

            {scanning && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <IconLoader2 className="h-4 w-4 animate-spin" />
                Scanning your local network for Raspberry Pis…
              </div>
            )}

            {!scanning && candidates.length === 0 && (
              <div className="rounded-lg border border-border/70 bg-background/45 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No Pis found. Make sure your Pi is powered on and connected to the same network.
                </p>
                <Button onClick={scanNetwork} variant="outline" size="sm" className="mt-3">
                  Try again
                </Button>
              </div>
            )}

            {!scanning && candidates.length > 0 && (
              <div className="space-y-2">
                {candidates.map((pi) => (
                  <button
                    key={pi.address}
                    type="button"
                    onClick={() => pushToPi(pi)}
                    className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-background/45 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div>
                      <p className="font-semibold">{pi.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {pi.address} · {pi.source === "mdns" ? "mDNS" : "Network scan"}
                      </p>
                    </div>
                    <IconRocket className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Network: Pushing to Pi ---- */}
        {phase === "network-push" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium">Setting up {selectedPi?.label}…</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/45 p-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{pushStatus}</p>
                <p className="text-xs">
                  This installs Herm, configures WiFi and device credentials, and starts the runtime.
                  The Pi will appear on your dashboard once it connects.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---- SD Card: Writing ---- */}
        {phase === "sd-write" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium">Writing to SD card…</p>
            </div>
            <p className="text-xs text-muted-foreground">{pushStatus}</p>
          </div>
        )}

        {/* ---- Download: Progress ---- */}
        {phase === "download-image" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium">{pushStatus || "Preparing downloads…"}</p>
            </div>
          </div>
        )}

        {/* ---- Done ---- */}
        {phase === "done" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <IconCircleCheck className="h-6 w-6" />
              <p className="text-lg font-semibold">
                {method === "network"
                  ? "Pi is set up!"
                  : method === "sd-card"
                    ? "SD card configured!"
                    : "Downloads ready!"}
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/45 p-4 text-sm">
              {method === "network" && (
                <p className="text-muted-foreground">
                  Your Pi is running Herm and syncing. Check the{" "}
                  <a href={`/dashboard/devices/${deviceId}`} className="underline">
                    live view
                  </a>{" "}
                  to see GPS, cameras, and plate detections.
                </p>
              )}

              {method === "sd-card" && (
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    ✅ Herm config files written to the SD card.
                  </p>
                  <p className="font-medium text-foreground">Next:</p>
                  <ol className="list-inside list-decimal space-y-1">
                    <li>Eject the SD card safely</li>
                    <li>Insert it into your Pi (which should already have Raspberry Pi OS)</li>
                    <li>Boot the Pi — it will read the config from <code className="text-xs">/boot/herm/</code></li>
                    <li>
                      SSH into the Pi and run the install command:
                      <code className="block mt-1 text-xs break-all">
                        curl -fsSL &apos;{apiBaseUrl}/api/device/setup/{deviceId}/bootstrap?secret={deviceSecret}&apos; | sudo bash
                      </code>
                    </li>
                    <li>
                      It will appear on your{" "}
                      <a href="/dashboard/devices" className="underline">
                        devices dashboard
                      </a>
                    </li>
                  </ol>
                </div>
              )}

              {method === "download" && (
                <div className="space-y-2 text-muted-foreground">
                  <p className="font-medium text-foreground">Next:</p>
                  <ol className="list-inside list-decimal space-y-1">
                    <li>
                      Flash{" "}
                      <a
                        href="https://www.raspberrypi.com/software/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Raspberry Pi OS Lite (64-bit)
                      </a>{" "}
                      onto your SD card
                    </li>
                    <li>Boot the Pi and connect to WiFi</li>
                    <li>
                      Run the bootstrap command from the config bundle, or SSH in and run:
                      <code className="block mt-1 text-xs break-all">
                        curl -fsSL &apos;{apiBaseUrl}/api/device/setup/{deviceId}/bootstrap?secret=...&apos; | sudo bash
                      </code>
                    </li>
                    <li>Pi installs Herm and appears on your dashboard</li>
                  </ol>
                </div>
              )}
            </div>

            <Button
              onClick={() => {
                setPhase("choose-profile")
                setMethod(null)
                setPushStatus("")
              }}
              variant="outline"
              size="sm"
            >
              Set up another device
            </Button>
          </div>
        )}

        {/* ---- Error ---- */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <IconAlertCircle className="h-5 w-5" />
              <p className="text-sm font-medium">Something went wrong</p>
            </div>
            <p className="text-xs text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setPhase("choose-method")
                  setError(null)
                }}
                variant="outline"
                size="sm"
              >
                Try another method
              </Button>
              <Button
                onClick={() => {
                  setPhase("choose-profile")
                  setMethod(null)
                  setError(null)
                }}
                variant="ghost"
                size="sm"
              >
                Start over
              </Button>
            </div>
          </div>
        )}

        {/* ---- Config Preview (always available) ---- */}
        {phase !== "choose-profile" && phase !== "done" && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Preview config files ▸
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">device.env</p>
                <pre className="mt-1 overflow-x-auto rounded-md border border-border/70 bg-background/70 p-2 text-xs">
                  {generateDeviceEnv()}
                </pre>
              </div>
              {wifiSsid && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">wifi.conf</p>
                  <pre className="mt-1 overflow-x-auto rounded-md border border-border/70 bg-background/70 p-2 text-xs">
                    {generateWifiConf()}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
