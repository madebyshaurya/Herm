import Image from "next/image"

import { PageHeader } from "@/components/dashboard/page-header"
import { SignalMap } from "@/components/dashboard/signal-map"
import { StatusPill } from "@/components/dashboard/status-pill"
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
        title="Plate detections and matches"
        description="Review crowdsourced plate sightings, matched reports, and the approximate signal map."
      />

      <Card className="border-border/70 bg-card/88">
        <CardHeader>
          <CardTitle>Signal map</CardTitle>
          <CardDescription>Point distribution for the most recent coordinates we have recorded.</CardDescription>
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

      <Card className="border-border/70 bg-card/88">
        <CardHeader>
          <CardTitle>Recent sightings</CardTitle>
          <CardDescription>Matched sightings are pinned ahead of ordinary detections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Coordinates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((sighting) => (
                <TableRow key={sighting.id}>
                  <TableCell className="font-medium">{formatPlate(sighting.normalized_plate)}</TableCell>
                  <TableCell>
                    {sighting.matched_stolen_report_id ? (
                      <StatusPill tone="matched">Matched</StatusPill>
                    ) : (
                      <StatusPill tone="offline">Observed</StatusPill>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(sighting.detected_at)}</TableCell>
                  <TableCell>
                    {formatCoordinate(sighting.latitude)}, {formatCoordinate(sighting.longitude)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid gap-4 lg:grid-cols-2">
            {ordered.slice(0, 6).map((sighting) => (
              <Card key={sighting.id} size="sm" className="border border-border/70 bg-background/45">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{formatPlate(sighting.normalized_plate)}</span>
                    {sighting.matched_stolen_report_id ? (
                      <StatusPill tone="matched">Matched</StatusPill>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{formatDateTime(sighting.detected_at)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sighting.snapshot_url ? (
                    <div className="relative aspect-[16/8] overflow-hidden rounded-lg border border-border/70">
                      <Image
                        alt={sighting.normalized_plate}
                        className="object-cover"
                        fill
                        sizes="(min-width: 1024px) 33vw, 100vw"
                        src={sighting.snapshot_url}
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[16/8] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                      No snapshot
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {formatCoordinate(sighting.latitude)}, {formatCoordinate(sighting.longitude)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
