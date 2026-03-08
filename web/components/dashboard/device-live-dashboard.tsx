"use client"

import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import Link from "next/link"
import {
  IconAntenna,
  IconArrowNarrowRight,
  IconMap2,
  IconMapPin,
  IconPhotoSensor3,
  IconRadar2,
  IconRefresh,
  IconRoute2,
} from "@tabler/icons-react"

import { CameraFeed } from "@/components/dashboard/camera-feed"
import { DeviceLiveMap } from "@/components/dashboard/device-live-map"
import { SatelliteSkyPlot } from "@/components/dashboard/satellite-sky-plot"
import { SystemHistoryChart, type SystemSample } from "@/components/dashboard/system-history-chart"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DeviceLiveData } from "@/lib/device-live"
import {
  formatAgeSeconds,
  formatCoordinate,
  formatDateTime,
  formatDurationSeconds,
  formatHeading,
  formatMemory,
  formatPlate,
  formatSpeed,
  formatTemperature,
} from "@/lib/format"

type DeviceLiveResponse = DeviceLiveData & { ok: true }

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border-border/70 bg-card/92 herm-hover-lift">
      <CardHeader className="gap-2">
        <CardDescription className="flex items-center gap-2">
          <span className="rounded-full bg-secondary/80 p-1 text-foreground">{icon}</span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

export function DeviceLiveDashboard({
  deviceId,
  initialData,
}: {
  deviceId: string
  initialData: DeviceLiveData
}) {
  const [data, setData] = useState(initialData)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [systemHistory, setSystemHistory] = useState<SystemSample[]>([])
  const historyRef = useRef(systemHistory)
  historyRef.current = systemHistory

  const refresh = useEffectEvent(async () => {
    const response = await fetch(`/api/dashboard/devices/${deviceId}/live`, {
      cache: "no-store",
    })

    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as DeviceLiveResponse

    startTransition(() => {
      setData(payload)
      setLastRefresh(Date.now())

      // Append to system history (rolling 60 samples)
      const t = payload.latestTelemetry
      if (t) {
        const sample: SystemSample = {
          time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          cpu: t.system_cpu_percent ?? null,
          temp: t.system_temp_c ?? null,
          ram: t.system_ram_used_mb ?? null,
          ramTotal: t.system_ram_total_mb ?? null,
        }
        const next = [...historyRef.current, sample].slice(-60)
        setSystemHistory(next)
      }
    })
  })

  // Poll every 2 seconds
  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh()
    }, 2000)

    return () => window.clearInterval(timer)
  }, [])

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  const telemetry = data.latestTelemetry
  const isOnline = data.health.backendReachable
  const live = isOnline ? telemetry : null
  const coordinates = {
    latitude: live?.latitude ?? data.device.last_latitude,
    longitude: live?.longitude ?? data.device.last_longitude,
  }

  const secondsAgo = Math.floor((Date.now() - lastRefresh) / 1000)

  return (
    <div className="space-y-6">
      {!isOnline && (
        <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-red-500" />
            </span>
            <div>
              <p className="font-semibold text-red-900">Device offline</p>
              <p className="text-sm text-red-800/70">
                No heartbeat in {formatAgeSeconds(data.health.heartbeatAgeSec)}.
                Values below are from the last known session — power on your Pi to get live data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Header + status ── */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live module stream</p>
          <h2 className="text-3xl font-semibold tracking-tight">{data.device.name}</h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Real-time GPS trail, satellite state, device health, camera feed, and plate detections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <IconRefresh className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {secondsAgo < 2 ? "just now" : `${secondsAgo}s ago`}
          </span>
          <StatusPill tone={data.health.connectionTone}>
            {data.health.backendReachable ? "Connected" : "Awaiting heartbeat"}
          </StatusPill>
          <StatusPill tone={data.health.gpsHealthy ? "online" : isOnline ? "connecting" : "offline"}>
            {data.health.gpsHealthy
              ? "GPS locked"
              : isOnline
                ? `GPS searching${live?.satellites_in_view ? ` (${live.satellites_in_view} visible)` : "..."}`
                : "GPS offline"}
          </StatusPill>
        </div>
      </section>

      {/* ── Status cards row ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-900/60">Heartbeat</p>
          <p className="mt-2 text-xl font-semibold text-sky-950">{formatAgeSeconds(data.health.heartbeatAgeSec)}</p>
          <p className="mt-1 text-sm text-sky-950/65">Last backend confirmation</p>
        </div>
        <MetricCard
          icon={<IconMapPin className="size-4" />}
          label="Coordinates"
          value={isOnline ? `${formatCoordinate(coordinates.latitude)}, ${formatCoordinate(coordinates.longitude)}` : "—"}
          detail={live?.captured_at ? `Updated ${formatDateTime(live.captured_at)}` : isOnline ? "No live fix yet." : "Device offline"}
        />
        <MetricCard
          icon={<IconRoute2 className="size-4" />}
          label="Speed / heading"
          value={isOnline ? `${formatSpeed(live?.speed_kmh)} · ${formatHeading(live?.heading_deg)}` : "—"}
          detail={isOnline ? (live?.status_text ?? "Waiting for GNSS state.") : "Device offline"}
        />
        <MetricCard
          icon={<IconRadar2 className={`size-4 ${isOnline && !data.health.gpsHealthy ? "animate-spin" : ""}`} />}
          label="Satellites"
          value={isOnline ? `${live?.satellites_in_use ?? 0} in use` : "—"}
          detail={isOnline
            ? data.health.gpsHealthy
              ? `${live?.satellites_in_view ?? 0} in view · fix mode ${live?.fix_mode ?? 1}`
              : "Acquiring satellites — keep sky visible..."
            : "Device offline"}
        />
      </section>

      {/* ── Camera feed (hero) ── */}
      <CameraFeed
        deviceId={deviceId}
        isOnline={isOnline}
        isCameraOnline={data.device.is_camera_online}
        piAddress={telemetry?.system_ip ?? null}
      />

      {/* ── Map + Satellite sky plot ── */}
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <DeviceLiveMap center={coordinates} trail={data.trail} hdop={live?.hdop ?? null} />

        <Card className="border-border/70 bg-card/92">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <IconMap2 className="size-4" />
              Satellite constellation
            </CardDescription>
            <CardTitle>Sky plot</CardTitle>
          </CardHeader>
          <CardContent>
            {isOnline && live?.satellites?.length ? (
              <div className="space-y-4">
                <SatelliteSkyPlot satellites={live.satellites} />
                <div className="space-y-2">
                  {live.satellites.slice(0, 8).map((satellite) => (
                    <div key={satellite.prn} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">PRN {satellite.prn}</span>
                        <span className="text-muted-foreground tabular-nums">SNR {satellite.snr ?? 0}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#f97316)] transition-[width] duration-300"
                          style={{ width: `${Math.max(8, Math.min(100, (satellite.snr ?? 0) * 2))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isOnline ? "No satellite samples yet." : "Device offline."}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── System performance charts ── */}
      {systemHistory.length > 1 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">System performance</h3>
          <SystemHistoryChart history={systemHistory} />
        </section>
      )}

      {/* ── Serial/network + quick metrics ── */}
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={<IconAntenna className="size-4" />}
          label="Serial / network"
          value={!isOnline ? "—" : data.health.serialConnected ? "Serial locked" : "Searching"}
          detail={!isOnline ? "Device offline" : live?.system_internet ? "Internet reachable" : "Internet unavailable"}
        />
        <div className="rounded-2xl border border-border/70 bg-card/92 p-4">
          <p className="text-xs text-muted-foreground mb-1">Uptime</p>
          <p className="text-xl font-semibold">{isOnline ? formatDurationSeconds(live?.system_uptime_sec) : "—"}</p>
          <p className="text-sm text-muted-foreground mt-1">{isOnline ? formatMemory(live?.system_ram_used_mb, live?.system_ram_total_mb) : "Device offline"}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/92 p-4">
          <p className="text-xs text-muted-foreground mb-1">Quick links</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/devices?device=${data.device.id}`}>Setup studio</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/sightings">
                Sightings <IconArrowNarrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Plate detections ── */}
      <section>
        <Card className="border-border/70 bg-card/92">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <IconPhotoSensor3 className="size-4" />
              Recent plate events
            </CardDescription>
            <CardTitle>Live detections</CardTitle>
          </CardHeader>
          <CardContent>
            {data.latestPlates.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.latestPlates.map((plate) => (
                  <div
                    key={plate.id}
                    className={`rounded-xl border p-3 ${
                      plate.matched_stolen_report_id
                        ? "border-red-300 bg-red-50/80 dark:bg-red-500/10"
                        : "border-border/70 bg-background/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base font-semibold tracking-wider">{formatPlate(plate.normalized_plate)}</p>
                      <StatusPill tone={plate.matched_stolen_report_id ? "matched" : "online"}>
                        {plate.matched_stolen_report_id ? "⚠ Stolen" : "Live"}
                      </StatusPill>
                    </div>
                    {plate.confidence != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Confidence: {(plate.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(plate.detected_at)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCoordinate(plate.latitude)}, {formatCoordinate(plate.longitude)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No license plates captured on this device yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
