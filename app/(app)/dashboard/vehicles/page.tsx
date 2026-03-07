import Image from "next/image"

import {
  closeStolenReport,
  createVehicle,
  openStolenReport,
  updateVehicle,
} from "@/app/(app)/dashboard/actions"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime, formatPlate } from "@/lib/format"
import { getVehiclesData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function VehiclesPage() {
  const user = await requireUser()
  const { vehicles, reports } = await getVehiclesData(user.id)
  const reportByVehicle = new Map<string, (typeof reports)[number]>()

  reports.forEach((report) => {
    if (!reportByVehicle.has(report.vehicle_id)) {
      reportByVehicle.set(report.vehicle_id, report)
    }
  })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Vehicles"
        title="Owned vehicles and recovery status"
        description="Register your vehicles, mark them stolen, and close reports when they are recovered."
      />

      <Card className="border-border/70 bg-card/88">
        <CardHeader>
          <CardTitle>Add a vehicle</CardTitle>
          <CardDescription>Store your plate details now so reporting theft takes one click later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createVehicle} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plateRaw">License plate</Label>
              <Input id="plateRaw" name="plateRaw" placeholder="ABC123" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input id="nickname" name="nickname" placeholder="Family SUV" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input id="make" name="make" placeholder="Toyota" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input id="model" name="model" placeholder="RAV4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" name="color" placeholder="Black" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">Photo</Label>
              <Input id="photo" name="photo" type="file" accept="image/*" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" placeholder="Distinctive bumper sticker, roof rack, damage notes..." />
            </div>
            <Button className="w-full md:w-fit" type="submit">
              Save vehicle
            </Button>
          </form>
        </CardContent>
      </Card>

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="Create your first vehicle to enable the stolen-report flow."
        />
      ) : (
        <div className="grid gap-4">
          {vehicles.map((vehicle) => {
            const report = reportByVehicle.get(vehicle.id)
            const isActive = report?.status === "active"

            return (
              <Card key={vehicle.id} className="border-border/70 bg-card/88">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle>{vehicle.nickname || formatPlate(vehicle.plate_normalized)}</CardTitle>
                    <StatusPill tone={isActive ? "active" : "recovered"}>
                      {isActive ? "Active stolen report" : "Owned vehicle"}
                    </StatusPill>
                  </div>
                  <CardDescription>
                    {formatPlate(vehicle.plate_normalized)}
                    {vehicle.make || vehicle.model || vehicle.color
                      ? ` · ${[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {vehicle.photo_url ? (
                    <div className="relative aspect-[4/1.2] overflow-hidden rounded-lg border border-border/70">
                      <Image
                        alt={vehicle.nickname || vehicle.plate_normalized}
                        className="object-cover"
                        fill
                        src={vehicle.photo_url}
                        sizes="(min-width: 1024px) 50vw, 100vw"
                      />
                    </div>
                  ) : null}

                  <form action={updateVehicle} className="grid gap-4 md:grid-cols-2">
                    <input name="vehicleId" type="hidden" value={vehicle.id} />
                    <div className="space-y-2">
                      <Label htmlFor={`plate-${vehicle.id}`}>License plate</Label>
                      <Input defaultValue={vehicle.plate_raw} id={`plate-${vehicle.id}`} name="plateRaw" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`nickname-${vehicle.id}`}>Nickname</Label>
                      <Input defaultValue={vehicle.nickname ?? ""} id={`nickname-${vehicle.id}`} name="nickname" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`make-${vehicle.id}`}>Make</Label>
                      <Input defaultValue={vehicle.make ?? ""} id={`make-${vehicle.id}`} name="make" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`model-${vehicle.id}`}>Model</Label>
                      <Input defaultValue={vehicle.model ?? ""} id={`model-${vehicle.id}`} name="model" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`color-${vehicle.id}`}>Color</Label>
                      <Input defaultValue={vehicle.color ?? ""} id={`color-${vehicle.id}`} name="color" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`photo-${vehicle.id}`}>Replace photo</Label>
                      <Input id={`photo-${vehicle.id}`} name="photo" type="file" accept="image/*" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`notes-${vehicle.id}`}>Notes</Label>
                      <Textarea defaultValue={vehicle.notes ?? ""} id={`notes-${vehicle.id}`} name="notes" />
                    </div>
                    <Button className="w-full md:w-fit" type="submit" variant="outline">
                      Update vehicle
                    </Button>
                  </form>

                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-background/45 p-4">
                    {isActive && report ? (
                      <>
                        <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                          Reported {formatDateTime(report.reported_at)}
                          {report.notes ? ` · ${report.notes}` : ""}
                        </div>
                        <form action={closeStolenReport}>
                          <input name="reportId" type="hidden" value={report.id} />
                          <Button type="submit">Mark recovered</Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                          No active theft report for this vehicle.
                        </div>
                        <form action={openStolenReport} className="flex flex-wrap items-center gap-3">
                          <input name="vehicleId" type="hidden" value={vehicle.id} />
                          <Input name="notes" placeholder="Report details (optional)" />
                          <Button type="submit">Report stolen</Button>
                        </form>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
