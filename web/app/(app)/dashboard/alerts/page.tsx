import Image from "next/image"
import { IconAlertTriangle, IconMapPin, IconCamera } from "@tabler/icons-react"

import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCoordinate, formatDateTime } from "@/lib/format"
import { getAlertsData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function AlertsPage() {
  const user = await requireUser()
  const alerts = await getAlertsData(user.id)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Alerts"
        title="Suspicious activity feed"
        description="Human-detection events from your own modules appear here with timestamps, snapshots, and coordinates."
      />

      {alerts.length === 0 ? (
        <EmptyState
          title="No alerts yet"
          description="Human-detection events will show up here as soon as your module posts them."
          icon={<IconAlertTriangle className="h-8 w-8" stroke={1.5} />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {alerts.map((alert, i) => (
            <BlurFade key={alert.id} delay={0.08 * i} inView>
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
                        <p className="text-xs text-muted-foreground">{formatDateTime(alert.detected_at)}</p>
                      </div>
                    </div>
                    <StatusPill tone="active">Alert</StatusPill>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alert.snapshot_url ? (
                    <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border/50">
                      <Image
                        alt="Suspicious activity snapshot"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        fill
                        sizes="(min-width: 1024px) 33vw, 100vw"
                        src={alert.snapshot_url}
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
                    {formatCoordinate(alert.latitude)}, {formatCoordinate(alert.longitude)}
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          ))}
        </div>
      )}
    </div>
  )
}
