import Image from "next/image"
import { IconCar, IconPlus, IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react"

import {
  closeStolenReport,
  createVehicle,
  openStolenReport,
  updateVehicle,
} from "@/app/(app)/dashboard/actions"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
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
        title="Owned vehicles & recovery"
        description="Register your vehicles, mark them stolen, and close reports when they are recovered."
      />

      {/* ── Add vehicle form ── */}
      <BlurFade delay={0.1} inView>
        <Card className="overflow-hidden border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-1.5">
                <IconPlus className="h-4 w-4 text-primary" stroke={2} />
              </div>
              <div>
                <CardTitle>Add a vehicle</CardTitle>
                <CardDescription>Store your plate details now so reporting theft takes one click later.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={createVehicle} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plateRaw">License plate</Label>
                <Input id="plateRaw" name="plateRaw" placeholder="ABC123" required className="font-mono tracking-wider" />
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
                <IconPlus className="mr-1.5 h-4 w-4" stroke={2} />
                Save vehicle
              </Button>
            </form>
          </CardContent>
        </Card>
      </BlurFade>

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="Create your first vehicle to enable the stolen-report flow."
          icon={<IconCar className="h-8 w-8" stroke={1.5} />}
        />
      ) : (
        <div className="grid gap-4">
          {vehicles.map((vehicle, i) => {
            const report = reportByVehicle.get(vehicle.id)
            const isActive = report?.status === "active"

            return (
              <BlurFade key={vehicle.id} delay={0.08 * i} inView>
                <Card className={`group relative overflow-hidden border-border/50 bg-card/80 transition-all duration-300 hover:shadow-lg ${isActive ? "hover:shadow-amber-500/5" : "hover:shadow-primary/5"}`}>
                  {isActive && (
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
                  )}
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className={`rounded-lg p-1.5 ${isActive ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                        {isActive
                          ? <IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" stroke={1.5} />
                          : <IconShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" stroke={1.5} />}
                      </div>
                      <CardTitle>{vehicle.nickname || formatPlate(vehicle.plate_normalized)}</CardTitle>
                      <StatusPill tone={isActive ? "active" : "recovered"}>
                        {isActive ? "Active stolen report" : "Owned vehicle"}
                      </StatusPill>
                    </div>
                    <CardDescription>
                      <span className="font-mono font-bold tracking-wider">{formatPlate(vehicle.plate_normalized)}</span>
                      {vehicle.make || vehicle.model || vehicle.color
                        ? ` · ${[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")}`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {vehicle.photo_url ? (
                      <div className="relative aspect-[4/1.2] overflow-hidden rounded-lg border border-border/50">
                        <Image
                          alt={vehicle.nickname || vehicle.plate_normalized}
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
                        <Input defaultValue={vehicle.plate_raw} id={`plate-${vehicle.id}`} name="plateRaw" required className="font-mono tracking-wider" />
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

                    <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors ${isActive ? "border-amber-500/20 bg-amber-500/5" : "border-border/50 bg-muted/20"}`}>
                      {isActive && report ? (
                        <>
                          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Reported stolen</span>
                            {" · "}{formatDateTime(report.reported_at)}
                            {report.notes ? ` · ${report.notes}` : ""}
                          </div>
                          <form action={closeStolenReport}>
                            <input name="reportId" type="hidden" value={report.id} />
                            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                              <IconShieldCheck className="mr-1.5 h-4 w-4" stroke={2} />
                              Mark recovered
                            </Button>
                          </form>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                            No active theft report for this vehicle.
                          </div>
                          <form action={openStolenReport} className="flex flex-wrap items-center gap-3">
                            <input name="vehicleId" type="hidden" value={vehicle.id} />
                            <Input name="notes" placeholder="Report details (optional)" className="max-w-xs" />
                            <Button type="submit" variant="destructive">
                              <IconAlertTriangle className="mr-1.5 h-4 w-4" stroke={2} />
                              Report stolen
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </BlurFade>
            )
          })}
        </div>
      )}
    </div>
  )
}
