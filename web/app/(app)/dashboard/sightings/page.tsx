import Image from "next/image"
import { IconRadar, IconMapPin, IconCamera } from "@tabler/icons-react"

import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { SignalMap } from "@/components/dashboard/signal-map"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCoordinate, formatDateTime, formatPlate } from "@/lib/format"
import { getSightingsData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function SightingsPage() {
  const user = await requireUser()
  const sightings = await getSightingsData(user.id)
  const ordered = [...sightings].sort((left, right) => {
    if (Boolean(left.matched_stolen_report_id) !== Boolean(right.matched_stolen_report_id)) {
      return left.matched_stolen_report_id ? -1 : 1
    }

    return new Date(right.detected_at).getTime() - new Date(left.detected_at).getTime()
  })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sightings"
        title="Plate detections & matches"
        description="Review crowdsourced plate sightings, matched reports, and the approximate signal map."
      />

      {/* ── Signal map ── */}
      <BlurFade delay={0.1} inView>
        <Card className="overflow-hidden border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <IconRadar className="h-4 w-4 text-primary" stroke={1.5} />
              </div>
              <div>
                <CardTitle>Signal map</CardTitle>
                <CardDescription>Point distribution for the most recent coordinates.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <SignalMap
              points={ordered.map((sighting) => ({
                id: sighting.id,
                latitude: sighting.latitude,
                longitude: sighting.longitude,
                matched: Boolean(sighting.matched_stolen_report_id),
              }))}
            />
          </CardContent>
        </Card>
      </BlurFade>

      {ordered.length === 0 ? (
        <EmptyState
          title="No sightings yet"
          description="Plate detections from the network will appear here as modules scan."
          icon={<IconRadar className="h-8 w-8" stroke={1.5} />}
        />
      ) : (
        <>
          {/* ── Table ── */}
          <BlurFade delay={0.2} inView>
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle>Recent sightings</CardTitle>
                <CardDescription>Matched sightings are pinned ahead of ordinary detections.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Plate</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Detected</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Coordinates</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordered.map((sighting) => (
                        <TableRow key={sighting.id} className="transition-colors">
                          <TableCell className="font-mono font-bold tracking-wider">{formatPlate(sighting.normalized_plate)}</TableCell>
                          <TableCell>
                            {sighting.matched_stolen_report_id ? (
                              <StatusPill tone="matched">Matched</StatusPill>
                            ) : (
                              <StatusPill tone="offline">Observed</StatusPill>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDateTime(sighting.detected_at)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <IconMapPin className="h-3 w-3" stroke={1.5} />
                              {formatCoordinate(sighting.latitude)}, {formatCoordinate(sighting.longitude)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* ── Snapshot cards ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.slice(0, 6).map((sighting, i) => (
              <BlurFade key={sighting.id} delay={0.1 * i} inView>
                <Card className="group overflow-hidden border-border/50 bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="font-mono tracking-wider">{formatPlate(sighting.normalized_plate)}</span>
                      {sighting.matched_stolen_report_id ? (
                        <StatusPill tone="matched">Matched</StatusPill>
                      ) : null}
                    </CardTitle>
                    <CardDescription>{formatDateTime(sighting.detected_at)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sighting.snapshot_url ? (
                      <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border/50">
                        <Image
                          alt={sighting.normalized_plate}
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          fill
                          sizes="(min-width: 1024px) 33vw, 100vw"
                          src={sighting.snapshot_url}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 bg-muted/20 text-muted-foreground">
                        <IconCamera className="h-6 w-6" stroke={1.5} />
                        <span className="text-xs">No snapshot</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <IconMapPin className="h-3.5 w-3.5" stroke={1.5} />
                      {formatCoordinate(sighting.latitude)}, {formatCoordinate(sighting.longitude)}
                    </div>
                  </CardContent>
                </Card>
              </BlurFade>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
