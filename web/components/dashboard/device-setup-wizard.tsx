"use client"

import { useEffect, useEffectEvent, useState } from "react"
import Link from "next/link"
import {
  IconAlertTriangle,
  IconAntenna,
  IconCamera,
  IconCheck,
  IconCircleDashed,
  IconCpu,
  IconExternalLink,
  IconKey,
  IconLoader2,
  IconMapPin,
  IconSatellite,
  IconTerminal2,
  IconWifi,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DeviceStatus = {
  ok: boolean
  online: boolean
  lastHeartbeatAt: string | null
  status: string
  firmwareVersion: string | null
  isGpsOnline: boolean
  isCameraOnline: boolean
  serialConnected: boolean
  hasFix: boolean
  satellitesInUse: number
  lastTelemetryAt: string | null
}

type SetupStep = "install" | "connecting" | "hardware" | "ready"

function stepIndex(step: SetupStep): number {
  return ["install", "connecting", "hardware", "ready"].indexOf(step)
}

function StepIndicator({
  step,
  currentStep,
  label,
  detail,
}: {
  step: SetupStep
  currentStep: SetupStep
  label: string
  detail: string
}) {
  const current = stepIndex(currentStep)
  const self = stepIndex(step)
  const done = self < current
  const active = self === current

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
            done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : active
                ? "border-blue-500 bg-blue-500/10 text-blue-500"
                : "border-border bg-background text-muted-foreground"
          }`}
        >
          {done ? (
            <IconCheck className="size-4" />
          ) : active ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconCircleDashed className="size-4" />
          )}
        </div>
      </div>
      <div className="min-w-0 pb-6">
        <p className={`text-sm font-medium ${done ? "text-emerald-600 dark:text-emerald-400" : active ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

type HwCheck = "pending" | "ok" | "warning" | "error"

function HardwareCheckItem({
  icon: Icon,
  label,
  status,
  detail,
  tip,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  status: HwCheck
  detail: string
  tip?: string
}) {
  const colors: Record<HwCheck, string> = {
    pending: "text-muted-foreground border-border",
    ok: "text-emerald-500 border-emerald-500/30",
    warning: "text-amber-500 border-amber-500/30",
    error: "text-red-500 border-red-500/30",
  }
  const bgColors: Record<HwCheck, string> = {
    pending: "bg-muted/30",
    ok: "bg-emerald-500/5",
    warning: "bg-amber-500/5",
    error: "bg-red-500/5",
  }
  const StatusIcon =
    status === "ok" ? IconCheck :
    status === "error" ? IconX :
    status === "warning" ? IconAlertTriangle :
    IconLoader2

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-all duration-300 ${colors[status]} ${bgColors[status]}`}>
      <Icon className="size-5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <StatusIcon className={`size-3.5 ${status === "pending" ? "animate-spin" : ""} ${colors[status].split(" ")[0]}`} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        {tip && (
          <p className="text-xs mt-1.5 px-2 py-1 rounded bg-background/60 border border-border/50 text-muted-foreground">
            💡 {tip}
          </p>
        )}
      </div>
    </div>
  )
}

function getGpsModuleStatus(s: DeviceStatus | null): { status: HwCheck; detail: string; tip?: string } {
  if (!s || !s.online) return { status: "pending", detail: "Waiting for device..." }
  if (s.isGpsOnline) return { status: "ok", detail: "SIM7600 GPS module detected and enabled" }
  if (s.serialConnected) return { status: "ok", detail: "GPS serial port active" }
  return {
    status: "error",
    detail: "GPS module not detected",
    tip: "Check that the SIM7600 HAT is firmly seated on the GPIO pins. Verify /dev/ttyUSB1 exists on the Pi.",
  }
}

function getGpsAntennaStatus(s: DeviceStatus | null, onlineSec: number): { status: HwCheck; detail: string; tip?: string } {
  if (!s || !s.online) return { status: "pending", detail: "Waiting for device..." }
  if (!s.isGpsOnline && !s.serialConnected) return { status: "pending", detail: "Needs GPS module first" }
  if (s.hasFix) return { status: "ok", detail: `Position locked — ${s.satellitesInUse} satellite${s.satellitesInUse !== 1 ? "s" : ""} in use` }
  if (s.satellitesInUse > 0) return { status: "warning", detail: `Acquiring fix — ${s.satellitesInUse} satellite${s.satellitesInUse !== 1 ? "s" : ""} found` }
  if (onlineSec > 180) {
    return {
      status: "warning",
      detail: "0 satellites after 3+ minutes",
      tip: "Move the Pi + antenna near a window with clear sky view. The GPS antenna's gold SMA pin must be screwed into the SIM7600 HAT's GNSS port.",
    }
  }
  return {
    status: "pending",
    detail: "Searching for satellites...",
    tip: onlineSec > 60 ? "First fix can take 1–5 minutes indoors. Move near a window for faster lock." : undefined,
  }
}

function getCameraStatus(s: DeviceStatus | null, onlineSec: number): { status: HwCheck; detail: string; tip?: string } {
  if (!s || !s.online) return { status: "pending", detail: "Waiting for device..." }
  if (s.isCameraOnline) return { status: "ok", detail: "Camera detected and streaming" }
  if (onlineSec > 60) {
    return {
      status: "warning",
      detail: "No camera detected",
      tip: "Check USB camera connection or CSI ribbon cable. Run 'ls /dev/video*' on the Pi to verify.",
    }
  }
  return { status: "pending", detail: "Detecting cameras..." }
}

function getSerialStatus(s: DeviceStatus | null): { status: HwCheck; detail: string; tip?: string } {
  if (!s || !s.online) return { status: "pending", detail: "Waiting for device..." }
  if (s.serialConnected) return { status: "ok", detail: "NMEA data flowing from GPS" }
  if (s.isGpsOnline) return { status: "pending", detail: "GPS enabled — opening serial port..." }
  return { status: "pending", detail: "Waiting for GPS module" }
}

export function DeviceSetupWizard({
  deviceId,
  deviceName,
  secret,
  bootstrapCmd,
}: {
  deviceId: string
  deviceName: string
  secret: string
  bootstrapCmd: string
}) {
  const [step, setStep] = useState<SetupStep>("install")
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [onlineSince, setOnlineSince] = useState<number | null>(null)

  const onlineSec = onlineSince ? Math.floor((Date.now() - onlineSince) / 1000) : 0

  const poll = useEffectEvent(async () => {
    try {
      const res = await fetch(`/api/device/heartbeat-check?deviceId=${deviceId}`, {
        cache: "no-store",
      })
      if (!res.ok) return
      const data = (await res.json()) as DeviceStatus
      setStatus(data)

      if (data.online && !onlineSince) {
        setOnlineSince(Date.now())
      } else if (!data.online) {
        setOnlineSince(null)
      }

      // Step logic
      if (!data.online) {
        setStep("install")
      } else if (!data.isGpsOnline && !data.serialConnected && !data.isCameraOnline) {
        setStep("connecting")
      } else if (data.satellitesInUse >= 1 || data.hasFix) {
        setStep("ready")
      } else {
        setStep("hardware")
      }
    } catch {
      // network error — keep current step
    }
    setPollCount((c) => c + 1)
  })

  useEffect(() => {
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const gpsModule = getGpsModuleStatus(status)
  const gpsAntenna = getGpsAntennaStatus(status, onlineSec)
  const camera = getCameraStatus(status, onlineSec)
  const serial = getSerialStatus(status)

  const allHwOk = gpsModule.status === "ok" && serial.status === "ok"

  return (
    <Card className="overflow-hidden border-border/70 bg-card/92">
      <CardHeader className="gap-2 border-b border-border/50 bg-gradient-to-r from-blue-500/[0.04] to-emerald-500/[0.04]">
        <div className="flex items-center gap-2">
          <IconTerminal2 className="size-5 text-blue-500" />
          <CardTitle className="text-base">Set up &ldquo;{deviceName}&rdquo;</CardTitle>
        </div>
        <CardDescription>
          Follow these steps to get your Pi online. This page auto-checks every 5 seconds.
          {pollCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground/60">
              <IconWifi className="size-3 animate-pulse" />
              Polling
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* ── Step indicators ── */}
        <div className="space-y-0">
          <StepIndicator
            step="install"
            currentStep={step}
            label="Install Herm on Pi"
            detail={step === "install" ? "Run the command below on your Pi" : "Herm software installed"}
          />
          <StepIndicator
            step="connecting"
            currentStep={step}
            label="Pi connected to Herm"
            detail={
              step === "connecting"
                ? "Heartbeat received — detecting hardware..."
                : stepIndex(step) > stepIndex("connecting")
                  ? `Firmware ${status?.firmwareVersion ?? "unknown"}`
                  : "Waiting for first heartbeat"
            }
          />
          <StepIndicator
            step="hardware"
            currentStep={step}
            label="Hardware check"
            detail={
              step === "hardware"
                ? "Verifying GPS, antenna & camera connections"
                : stepIndex(step) > stepIndex("hardware")
                  ? "All hardware verified"
                  : "Waiting for connection"
            }
          />
          <StepIndicator
            step="ready"
            currentStep={step}
            label="Ready to go"
            detail={step === "ready" ? "All systems operational" : "Complete the steps above"}
          />
        </div>

        {/* ── Content per step ── */}
        {step === "install" && (
          <div className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-blue-500/20 bg-black/80 p-4 pr-12 font-mono text-xs text-blue-300 leading-relaxed select-all">
                {bootstrapCmd}
              </pre>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 p-3 text-sm text-muted-foreground">
              <IconKey className="size-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Secret: <code className="font-mono text-xs break-all select-all">{secret}</code>
                <span className="ml-1 text-amber-600 dark:text-amber-400">(shown once)</span>
              </span>
            </div>

            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <span className="text-xs transition-transform group-open:rotate-90">▶</span>
                First time? How to get started
              </summary>
              <ol className="mt-3 ml-1 space-y-2 text-sm text-muted-foreground border-l-2 border-border/50 pl-4">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">1</span>
                  Flash{" "}
                  <a
                    href="https://www.raspberrypi.com/software/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-foreground font-medium"
                  >
                    Raspberry Pi OS (64-bit)
                  </a>{" "}
                  onto an SD card using Raspberry Pi Imager
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">2</span>
                  In the imager, click the gear icon → <strong>enable SSH</strong> and <strong>set WiFi credentials</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">3</span>
                  Insert SD card into Pi, power on, wait ~60s for it to connect to WiFi
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">4</span>
                  SSH in: <code className="text-xs font-mono bg-secondary/60 px-1.5 py-0.5 rounded">ssh pi@raspberrypi.local</code> → paste the command above
                </li>
              </ol>
            </details>

            <div className="rounded-lg border border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/[0.05] p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Waiting for your Pi to check in...</strong> Once the bootstrap finishes and the service starts,
                this page will automatically advance to the next step.
              </p>
            </div>
          </div>
        )}

        {step === "connecting" && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/[0.05] p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              ✓ Pi is online! Detecting hardware...
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Herm is detecting your GPS module, cameras, and SIM7600 HAT. This usually takes 10–30 seconds.
            </p>
          </div>
        )}

        {/* ── Hardware diagnostic checklist ── */}
        {(step === "hardware" || step === "connecting") && status?.online && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <IconCpu className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hardware diagnostics</span>
            </div>
            <HardwareCheckItem icon={IconAntenna} label="GPS Module" {...gpsModule} />
            <HardwareCheckItem icon={IconMapPin} label="NMEA Serial" {...serial} />
            <HardwareCheckItem icon={IconSatellite} label="GPS Antenna / Satellites" {...gpsAntenna} />
            <HardwareCheckItem icon={IconCamera} label="Camera" {...camera} />
          </div>
        )}

        {step === "hardware" && allHwOk && (
          <div className="rounded-lg border border-orange-500/20 bg-orange-50/50 dark:bg-orange-500/[0.05] p-4 space-y-2">
            <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
              GPS hardware connected — searching for satellites ({status?.satellitesInUse ?? 0} found)
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-400">
              First GPS fix can take 1–5 minutes, especially indoors. Move the Pi near a window for best results.
            </p>
          </div>
        )}

        {step === "ready" && (
          <div className="space-y-4">
            {/* Show hardware checklist in ready state too */}
            {status?.online && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <IconCpu className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hardware diagnostics</span>
                </div>
                <HardwareCheckItem icon={IconAntenna} label="GPS Module" {...gpsModule} />
                <HardwareCheckItem icon={IconMapPin} label="NMEA Serial" {...serial} />
                <HardwareCheckItem icon={IconSatellite} label="GPS Antenna / Satellites" {...gpsAntenna} />
                <HardwareCheckItem icon={IconCamera} label="Camera" {...camera} />
              </div>
            )}

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/[0.05] p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                ✓ All systems go — {deviceName} is live!
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                GPS {status?.hasFix ? "locked" : "acquiring"} ({status?.satellitesInUse ?? 0} satellites)
                {status?.isCameraOnline ? " · Camera streaming" : ""}
                {" · "}Firmware {status?.firmwareVersion ?? "unknown"}
              </p>
            </div>
            <Button asChild size="lg" className="w-full gap-2">
              <Link href={`/dashboard/devices/${deviceId}`}>
                <IconExternalLink className="size-4" />
                Open live dashboard
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
