import Image from "next/image"

import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {alerts.map((alert) => (
            <Card key={alert.id} className="border-border/70 bg-card/88">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Suspicious activity detected</CardTitle>
                    <CardDescription>{formatDateTime(alert.detected_at)}</CardDescription>
                  </div>
                  <StatusPill tone="active">Alert</StatusPill>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {alert.snapshot_url ? (
                  <div className="relative aspect-[16/8] overflow-hidden rounded-lg border border-border/70">
                    <Image
                      alt="Suspicious activity snapshot"
                      className="object-cover"
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      src={alert.snapshot_url}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/8] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    No snapshot
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  {formatCoordinate(alert.latitude)}, {formatCoordinate(alert.longitude)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
