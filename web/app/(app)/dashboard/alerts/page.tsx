import Image from "next/image"
import { IconAlertTriangle, IconMapPin, IconCamera, IconCar } from "@tabler/icons-react"

import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCoordinate, formatDateTime, formatPlate } from "@/lib/format"
import { getAlertsData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function AlertsPage() {
  const user = await requireUser()
  const { humanAlerts, stolenSightings } = await getAlertsData(user.id)

  // Merge into a single timeline sorted by date
  type AlertItem =
    | { kind: "human"; id: string; detected_at: string; snapshot_url: string | null; latitude: number | null; longitude: number | null }
    | { kind: "stolen"; id: string; detected_at: string; snapshot_url: string | null; latitude: number | null; longitude: number | null; plate: string; confidence: number | null }

  const timeline: AlertItem[] = [
    ...humanAlerts.map((a) => ({ kind: "human" as const, id: a.id, detected_at: a.detected_at, snapshot_url: a.snapshot_url, latitude: a.latitude, longitude: a.longitude })),
    ...stolenSightings.map((s) => ({ kind: "stolen" as const, id: s.id, detected_at: s.detected_at, snapshot_url: s.snapshot_url, latitude: s.latitude, longitude: s.longitude, plate: s.normalized_plate, confidence: s.confidence })),
  ].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Alerts"
        title="Activity feed"
        description="Stolen vehicle sightings and human-detection events from your modules."
      />

      {timeline.length === 0 ? (
        <EmptyState
          title="No alerts yet"
          description="Stolen plate matches and human-detection events will show up here."
          icon={<IconAlertTriangle className="h-8 w-8" stroke={1.5} />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {timeline.map((item, i) => (
            <BlurFade key={item.id} delay={0.08 * Math.min(i, 8)} inView>
              {item.kind === "stolen" ? (
                <Card className="group relative overflow-hidden border-red-500/30 bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10">
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-red-500/10 p-1.5">
                          <IconCar className="h-4 w-4 text-red-600 dark:text-red-400" stroke={1.5} />
                        </div>
                        <div>
                          <CardTitle className="text-base">
                            Stolen vehicle spotted — <span className="font-mono tracking-wider">{formatPlate(item.plate)}</span>
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{formatDateTime(item.detected_at)}</p>
                        </div>
                      </div>
                      <StatusPill tone="danger">Stolen</StatusPill>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.snapshot_url ? (
                      <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-red-500/20">
                        <Image
                          alt="Stolen vehicle snapshot"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          fill
                          sizes="(min-width: 1024px) 33vw, 100vw"
                          src={item.snapshot_url}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-red-500/20 bg-red-500/5 text-muted-foreground">
                        <IconCamera className="h-6 w-6" stroke={1.5} />
                        <span className="text-xs">No snapshot available</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <IconMapPin className="h-3.5 w-3.5" stroke={1.5} />
                        {formatCoordinate(item.latitude)}, {formatCoordinate(item.longitude)}
                      </div>
                      {item.confidence != null && (
                        <span className="text-xs opacity-60">{Math.round(item.confidence * 100)}% conf</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="group relative overflow-hidden border-border/50 bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-500/10 p-1.5">
                          <IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" stroke={1.5} />
                        </div>
                        <div>
                          <CardTitle className="text-base">Suspicious activity</CardTitle>
                          <p className="text-xs text-muted-foreground">{formatDateTime(item.detected_at)}</p>
                        </div>
                      </div>
                      <StatusPill tone="active">Alert</StatusPill>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.snapshot_url ? (
                      <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border/50">
                        <Image
                          alt="Suspicious activity snapshot"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          fill
                          sizes="(min-width: 1024px) 33vw, 100vw"
                          src={item.snapshot_url}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 bg-muted/20 text-muted-foreground">
                        <IconCamera className="h-6 w-6" stroke={1.5} />
                        <span className="text-xs">No snapshot available</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <IconMapPin className="h-3.5 w-3.5" stroke={1.5} />
                      {formatCoordinate(item.latitude)}, {formatCoordinate(item.longitude)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </BlurFade>
          ))}
        </div>
      )}
    </div>
  )
}
