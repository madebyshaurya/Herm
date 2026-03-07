import { PageHeader } from "@/components/dashboard/page-header"
import { StatCard } from "@/components/dashboard/stat-card"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCoordinate, formatDateTime, formatPlate } from "@/lib/format"
import { getOverviewData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function DashboardPage() {
  const user = await requireUser()
  const overview = await getOverviewData(user.id)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Owner command center"
        description="Track stolen vehicle reports, incoming detections, and module health from one place."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active reports"
          value={overview.activeReportCount}
          description="Vehicles currently marked as stolen."
        />
        <StatCard
          title="Registered devices"
          value={overview.deviceCount}
          description="Modules linked to your account."
        />
        <StatCard
          title="Devices online"
          value={overview.onlineDeviceCount}
          description="Modules that most recently reported as online."
        />
        <StatCard
          title="Latest alert"
          value={overview.latestAlert ? "Live" : "Idle"}
          description="Realtime updates will refresh this overview automatically."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/88">
          <CardHeader>
            <CardTitle>Latest matched sighting</CardTitle>
            <CardDescription>The newest detection linked to one of your stolen reports.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.latestMatch ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-medium">{formatPlate(overview.latestMatch.normalized_plate)}</p>
                  <StatusPill tone="matched">Matched</StatusPill>
                </div>
                <p className="text-muted-foreground">{formatDateTime(overview.latestMatch.detected_at)}</p>
                <p className="text-muted-foreground">
                  {formatCoordinate(overview.latestMatch.latitude)}, {formatCoordinate(overview.latestMatch.longitude)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No matched sightings yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/88">
          <CardHeader>
            <CardTitle>Latest suspicious activity</CardTitle>
            <CardDescription>The most recent human-detection event from your own modules.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.latestAlert ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-medium">Human detection</p>
                  <StatusPill tone="active">Alert</StatusPill>
                </div>
                <p className="text-muted-foreground">{formatDateTime(overview.latestAlert.detected_at)}</p>
                <p className="text-muted-foreground">
                  {formatCoordinate(overview.latestAlert.latitude)}, {formatCoordinate(overview.latestAlert.longitude)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No suspicious activity logged yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
