import {
  IconCpu,
  IconGps,
  IconCamera,
  IconKey,
  IconPlus,
  IconSettings,
  IconActivity,
  IconMapPin,
  IconTrash,
  IconRefresh,
  IconExternalLink,
  IconDevices2,
} from "@tabler/icons-react"

import { createDevice, rotateDeviceSecret, deleteDevice } from "@/app/(app)/dashboard/actions"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { DeviceSetupWizard } from "@/components/dashboard/device-setup-wizard"
import { EmptyState } from "@/components/dashboard/empty-state"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAppOrigin } from "@/lib/app-origin"
import { getEffectiveDeviceStatus } from "@/lib/devices"
import { formatCoordinate, formatRelativeStatusDate } from "@/lib/format"
import { getDevicesData } from "@/lib/dashboard-data"
import { requireUser } from "@/lib/auth"

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const devices = await getDevicesData(user.id)
  const params = await searchParams
  const appOrigin = await getAppOrigin()
  const selectedDeviceId = typeof params.device === "string" ? params.device : null
  const secret = typeof params.secret === "string" ? params.secret : null
  const selectedDevice = selectedDeviceId
    ? devices.find((device) => device.id === selectedDeviceId) ?? null
    : null

  const bootstrapCmd = selectedDevice && secret
    ? `curl -fsSL '${appOrigin}/api/device/setup/${selectedDevice.id}/bootstrap?secret=${encodeURIComponent(secret)}' | sudo bash`
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Devices"
        title="Your Devices"
        description="Register and provision Raspberry Pi dashcam modules."
      />

      {/* ── Setup Wizard (shown after creating / rotating a device) ── */}
      {selectedDevice && secret && bootstrapCmd ? (
        <BlurFade delay={0.05}>
          <DeviceSetupWizard
            deviceId={selectedDevice.id}
            deviceName={selectedDevice.name}
            secret={secret}
            bootstrapCmd={bootstrapCmd}
          />
        </BlurFade>
      ) : null}

      {selectedDevice && !secret ? (
        <BlurFade delay={0.05}>
          <Card className="border-amber-500/20 bg-amber-500/[0.03]">
            <CardContent className="flex items-center gap-3 py-4">
              <IconKey className="size-5 text-amber-500 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Secret for <strong>{selectedDevice.name}</strong> was already shown. Click <strong>Rotate secret</strong> on the device card to generate a new install command.
              </p>
            </CardContent>
          </Card>
        </BlurFade>
      ) : null}

      {/* ── Add Device (compact inline form) ── */}
      <BlurFade delay={0.1}>
        <Card className="border-border/70 bg-card/88">
          <CardContent className="py-4">
            <form action={createDevice} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="name" className="text-xs">New device name</Label>
                <Input id="name" name="name" placeholder='e.g. "Front dashcam"' required className="h-9" />
              </div>
              <div className="w-44 space-y-1.5">
                <Label htmlFor="profile" className="text-xs">Profile</Label>
                <select
                  id="profile"
                  name="profile"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue="full"
                >
                  <option value="full">Full (GPS + camera)</option>
                  <option value="watcher">Watcher (WiFi only)</option>
                </select>
              </div>
              <Button type="submit" size="sm" className="gap-1.5 h-9">
                <IconPlus className="size-3.5" />
                Add device
              </Button>
            </form>
          </CardContent>
        </Card>
      </BlurFade>

      {/* ── Device List ── */}
      {devices.length === 0 ? (
        <BlurFade delay={0.15}>
          <EmptyState
            icon={<IconDevices2 className="size-8" />}
            title="No devices yet"
            description="Create your first device above to get a setup command for your Raspberry Pi."
          />
        </BlurFade>
      ) : (
        <div className="space-y-3">
          {devices.map((device, i) => {
            const effectiveStatus = getEffectiveDeviceStatus(device)
            const isOnline = effectiveStatus === "online"

            return (
              <BlurFade key={device.id} delay={0.15 + i * 0.04}>
                <Card className={`border-border/70 bg-card/88 transition-all hover:shadow-sm ${isOnline ? "border-l-2 border-l-emerald-500" : ""}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      {/* Left: identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`rounded-lg p-2 shrink-0 ${isOnline ? "bg-emerald-500/10" : "bg-muted/50"}`}>
                          <IconCpu className={`size-5 ${isOnline ? "text-emerald-500" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{device.name}</p>
                            <StatusPill tone={effectiveStatus}>{effectiveStatus}</StatusPill>
                            {device.firmware_version && (
                              <span className="hidden sm:inline rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {device.firmware_version}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{device.id}</p>
                        </div>
                      </div>

                      {/* Center: key metrics (inline) */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <IconActivity className="size-3" />
                          {formatRelativeStatusDate(device.last_heartbeat_at)}
                        </span>
                        <span className={`flex items-center gap-1 ${device.is_camera_online ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          <IconCamera className="size-3" />
                          {device.is_camera_online ? "Cam on" : "Cam off"}
                        </span>
                        <span className={`flex items-center gap-1 ${device.is_gps_online ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          <IconGps className="size-3" />
                          {device.is_gps_online ? "GPS on" : "GPS off"}
                        </span>
                        {device.last_latitude ? (
                          <span className="flex items-center gap-1 font-mono">
                            <IconMapPin className="size-3" />
                            {formatCoordinate(device.last_latitude)}, {formatCoordinate(device.last_longitude)}
                          </span>
                        ) : null}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOnline ? (
                          <Button asChild size="sm" variant="default" className="gap-1 h-8 text-xs">
                            <a href={`/dashboard/devices/${device.id}`}>
                              <IconExternalLink className="size-3" />
                              Live
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" disabled>
                            <IconExternalLink className="size-3" />
                            Live
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline" className="gap-1 h-8 text-xs">
                          <a href={`/dashboard/devices?device=${device.id}`}>
                            <IconSettings className="size-3" />
                            Setup
                          </a>
                        </Button>
                        <form action={rotateDeviceSecret}>
                          <input name="deviceId" type="hidden" value={device.id} />
                          <Button type="submit" size="sm" variant="outline" className="gap-1 h-8 text-xs">
                            <IconRefresh className="size-3" />
                            Rotate
                          </Button>
                        </form>
                        <form action={deleteDevice}>
                          <input name="deviceId" type="hidden" value={device.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="gap-1 h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <IconTrash className="size-3" />
                          </Button>
                        </form>
                      </div>
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
