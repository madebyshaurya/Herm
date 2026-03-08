import {
  IconAlertTriangle,
  IconCar,
  IconDevices,
  IconMapPin,
  IconRadar,
  IconWifi,
  IconEye,
  IconShieldCheck,
} from "@tabler/icons-react"
import Link from "next/link"

import { PageHeader } from "@/components/dashboard/page-header"
import { StatCard } from "@/components/dashboard/stat-card"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
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

      {/* ── Stat cards with staggered animations ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BlurFade delay={0.1} inView>
          <StatCard
            title="Active reports"
            value={overview.activeReportCount}
            description="Vehicles currently marked as stolen."
            icon={<IconAlertTriangle className="h-5 w-5" stroke={1.5} />}
            gradient="rose"
          />
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <StatCard
            title="Registered devices"
            value={overview.deviceCount}
            description="Modules linked to your account."
            icon={<IconDevices className="h-5 w-5" stroke={1.5} />}
            gradient="blue"
          />
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <StatCard
            title="Devices online"
            value={overview.onlineDeviceCount}
            description="Modules that sent a heartbeat recently."
            icon={<IconWifi className="h-5 w-5" stroke={1.5} />}
            gradient="emerald"
          />
        </BlurFade>
        <BlurFade delay={0.25} inView>
          <StatCard
            title="Latest alert"
            value={overview.latestAlert ? "Live" : "Idle"}
            description="Realtime updates refresh automatically."
            icon={<IconEye className="h-5 w-5" stroke={1.5} />}
            gradient="amber"
          />
        </BlurFade>
      </section>

      {/* ── Feature cards ── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <BlurFade delay={0.3} inView>
          <Card className="group relative overflow-hidden border-border/50 bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/5">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-rose-500/10 p-1.5">
                  <IconRadar className="h-4 w-4 text-rose-600 dark:text-rose-400" stroke={1.5} />
                </div>
                <CardTitle>Latest matched sighting</CardTitle>
              </div>
              <CardDescription>The newest detection linked to one of your stolen reports.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.latestMatch ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold tracking-wide font-mono">{formatPlate(overview.latestMatch.normalized_plate)}</p>
                    <StatusPill tone="matched">Matched</StatusPill>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <IconMapPin className="h-3.5 w-3.5" stroke={1.5} />
                    <span>{formatCoordinate(overview.latestMatch.latitude)}, {formatCoordinate(overview.latestMatch.longitude)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(overview.latestMatch.detected_at)}</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-6">
                  <IconShieldCheck className="h-6 w-6 text-emerald-500" stroke={1.5} />
                  <div>
                    <p className="text-sm font-medium text-foreground">All clear</p>
                    <p className="text-xs text-muted-foreground">No matched sightings recorded yet.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <Card className="group relative overflow-hidden border-border/50 bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-500/10 p-1.5">
                  <IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" stroke={1.5} />
                </div>
                <CardTitle>Latest alert</CardTitle>
              </div>
              <CardDescription>The newest human-detection or stolen-vehicle event tied to your account.</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.latestAlert ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    {overview.latestAlert.kind === "stolen" ? (
                      <>
                        <p className="text-lg font-semibold">
                          Stolen vehicle spotted: {formatPlate(overview.latestAlert.normalized_plate)}
                        </p>
                        <StatusPill tone="danger">Stolen</StatusPill>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-semibold">Human detected</p>
                        <StatusPill tone="active">Alert</StatusPill>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <IconMapPin className="h-3.5 w-3.5" stroke={1.5} />
                    <span>{formatCoordinate(overview.latestAlert.latitude)}, {formatCoordinate(overview.latestAlert.longitude)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(overview.latestAlert.detected_at)}</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-6">
                  <IconShieldCheck className="h-6 w-6 text-emerald-500" stroke={1.5} />
                  <div>
                    <p className="text-sm font-medium text-foreground">No alerts</p>
                    <p className="text-xs text-muted-foreground">Activity events will appear here as your devices report them.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </BlurFade>
      </section>

      {/* ── Quick actions ── */}
      <BlurFade delay={0.4} inView>
        <section className="grid gap-3 sm:grid-cols-3">
          <Link href="/dashboard/vehicles" className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm">
            <div className="rounded-lg bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
              <IconCar className="h-5 w-5 text-primary" stroke={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Manage vehicles</p>
              <p className="text-xs text-muted-foreground">Register plates & file reports</p>
            </div>
          </Link>
          <Link href="/dashboard/devices" className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm">
            <div className="rounded-lg bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
              <IconDevices className="h-5 w-5 text-primary" stroke={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Set up devices</p>
              <p className="text-xs text-muted-foreground">Connect Raspberry Pi modules</p>
            </div>
          </Link>
          <Link href="/dashboard/sightings" className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm">
            <div className="rounded-lg bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
              <IconRadar className="h-5 w-5 text-primary" stroke={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">View sightings</p>
              <p className="text-xs text-muted-foreground">Plate detections & signal map</p>
            </div>
          </Link>
        </section>
      </BlurFade>
    </div>
  )
}
