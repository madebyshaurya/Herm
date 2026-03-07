"use client"

import { startTransition, useEffect, useEffectEvent, useState } from "react"
import Link from "next/link"
import {
  IconAntenna,
  IconArrowNarrowRight,
  IconCpu,
  IconMap2,
  IconMapPin,
  IconPhotoSensor3,
  IconRadar2,
  IconRoute2,
  IconTemperature,
} from "@tabler/icons-react"

import { DeviceLiveMap } from "@/components/dashboard/device-live-map"
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
    })
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [])

  const telemetry = data.latestTelemetry
  const coordinates = {
    latitude: telemetry?.latitude ?? data.device.last_latitude,
    longitude: telemetry?.longitude ?? data.device.last_longitude,
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92))] herm-panel-reveal">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live module stream</p>
                <div>
                  <CardTitle className="text-3xl tracking-tight">{data.device.name}</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
                    Herm is pulling the latest GPS trail, satellite state, device health, and plate detections
                    for this Raspberry Pi.
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={data.health.connectionTone}>
                  {data.health.backendReachable ? "Connected" : "Awaiting heartbeat"}
                </StatusPill>
                <StatusPill tone={data.health.gpsHealthy ? "online" : "offline"}>
                  {data.health.gpsHealthy ? "GPS healthy" : "GPS degraded"}
                </StatusPill>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-sky-900/60">Heartbeat</p>
              <p className="mt-3 text-xl font-semibold text-sky-950">{formatAgeSeconds(data.health.heartbeatAgeSec)}</p>
              <p className="mt-2 text-sm text-sky-950/65">Last known backend confirmation.</p>
            </div>
            <div className="rounded-2xl border border-orange-200/70 bg-orange-50/70 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-orange-900/60">Telemetry</p>
              <p className="mt-3 text-xl font-semibold text-orange-950">
                {formatAgeSeconds(data.health.telemetryAgeSec)}
              </p>
              <p className="mt-2 text-sm text-orange-950/65">Latest rich GNSS sample from the Pi.</p>
            </div>
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-stone-700">Install / access</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/dashboard/devices?device=${data.device.id}`}>Open setup studio</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/sightings">
                    Sightings
                    <IconArrowNarrowRight />
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-sm text-stone-600">Device ID {data.device.id}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <MetricCard
            icon={<IconMapPin className="size-4" />}
            label="Coordinates"
            value={`${formatCoordinate(coordinates.latitude)}, ${formatCoordinate(coordinates.longitude)}`}
            detail={telemetry?.captured_at ? `Updated ${formatDateTime(telemetry.captured_at)}` : "No live fix yet."}
          />
          <MetricCard
            icon={<IconRoute2 className="size-4" />}
            label="Speed / heading"
            value={`${formatSpeed(telemetry?.speed_kmh)} · ${formatHeading(telemetry?.heading_deg)}`}
            detail={telemetry?.status_text ?? "Waiting for GNSS state."}
          />
          <MetricCard
            icon={<IconRadar2 className="size-4" />}
            label="Satellites"
            value={`${telemetry?.satellites_in_use ?? 0} in use`}
            detail={`${telemetry?.satellites_in_view ?? 0} in view · fix mode ${telemetry?.fix_mode ?? 1}`}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <DeviceLiveMap center={coordinates} trail={data.trail} />

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={<IconCpu className="size-4" />}
              label="Processor"
              value={
                telemetry?.system_cpu_percent == null ? "Unknown" : `${telemetry.system_cpu_percent.toFixed(1)}%`
              }
              detail={formatMemory(telemetry?.system_ram_used_mb, telemetry?.system_ram_total_mb)}
            />
            <MetricCard
              icon={<IconTemperature className="size-4" />}
              label="Thermals"
              value={formatTemperature(telemetry?.system_temp_c)}
              detail={`Uptime ${formatDurationSeconds(telemetry?.system_uptime_sec)}`}
            />
            <MetricCard
              icon={<IconAntenna className="size-4" />}
              label="Serial / network"
              value={data.health.serialConnected ? "Serial locked" : "Searching"}
              detail={telemetry?.system_internet ? "Internet reachable" : "Internet unavailable"}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <Card className="border-border/70 bg-card/92 herm-panel-reveal" data-delay="1">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <IconMap2 className="size-4" />
                Satellite picture
              </CardDescription>
              <CardTitle>Constellation health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {telemetry?.satellites?.length ? (
                telemetry.satellites.slice(0, 8).map((satellite) => (
                  <div key={satellite.prn} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">PRN {satellite.prn}</span>
                      <span className="text-muted-foreground">SNR {satellite.snr ?? 0}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#f97316)] transition-[width] duration-300"
                        style={{ width: `${Math.max(12, Math.min(100, (satellite.snr ?? 0) * 2))}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No satellite samples have been streamed yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/92 herm-panel-reveal" data-delay="2">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <IconPhotoSensor3 className="size-4" />
                Recent plate events
              </CardDescription>
              <CardTitle>Live detections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.latestPlates.length ? (
                data.latestPlates.map((plate) => (
                  <div
                    key={plate.id}
                    className="rounded-2xl border border-border/70 bg-background/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base font-semibold">{formatPlate(plate.normalized_plate)}</p>
                      <StatusPill tone={plate.matched_stolen_report_id ? "matched" : "online"}>
                        {plate.matched_stolen_report_id ? "Matched" : "Live only"}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{formatDateTime(plate.detected_at)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCoordinate(plate.latitude)}, {formatCoordinate(plate.longitude)}
                    </p>
                    {!plate.matched_stolen_report_id ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Not persisted unless matched to an active stolen report
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No license plates captured on this device yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
