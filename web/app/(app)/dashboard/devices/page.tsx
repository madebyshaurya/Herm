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
  IconWifi,
  IconInfoCircle,
} from "@tabler/icons-react"

import { createDevice, rotateDeviceSecret, deleteDevice } from "@/app/(app)/dashboard/actions"
import { DeviceSetupStudio } from "@/components/dashboard/device-setup-studio"
import { FirmwareFlasher } from "@/components/dashboard/firmware-flasher"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { EmptyState } from "@/components/dashboard/empty-state"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAppOrigin } from "@/lib/app-origin"
import { getEffectiveDeviceStatus } from "@/lib/devices"
import { formatCoordinate, formatRelativeStatusDate } from "@/lib/format"
import { getDevicesData } from "@/lib/dashboard-data"
import { buildDeviceSetupBundle } from "@/lib/device-setup"
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
  const setupBundle =
    selectedDevice && secret
      ? buildDeviceSetupBundle({
          apiBaseUrl: appOrigin,
          bootstrapUrl: `${appOrigin}/api/device/setup/${selectedDevice.id}/bootstrap?secret=${encodeURIComponent(secret)}`,
          deviceId: selectedDevice.id,
          deviceName: selectedDevice.name,
          deviceSecret: secret,
        })
      : null

  const onlineCount = devices.filter((d) => getEffectiveDeviceStatus(d) === "online").length

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Devices"
        title="Raspberry Pi Fleet"
        description="Register, provision, and monitor your dashcam modules. Each device auto-reports GPS, cameras, and plate detections."
      />

      {/* ── Quick Stats ── */}
      <BlurFade delay={0.05}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-4">
            <div className="rounded-lg bg-blue-500/10 p-2"><IconDevices2 className="size-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold">{devices.length}</p>
              <p className="text-xs text-muted-foreground">Total devices</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2"><IconActivity className="size-5 text-emerald-500" /></div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-xs text-muted-foreground">Online now</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-4">
            <div className="rounded-lg bg-amber-500/10 p-2"><IconKey className="size-5 text-amber-500" /></div>
            <div>
              <p className="text-2xl font-bold">
                {devices.reduce((sum, d) => sum + d.device_secrets.filter((s) => !s.revoked_at).length, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Active secrets</p>
            </div>
          </div>
        </div>
      </BlurFade>

      {/* ── Setup Secret (shown once after create/rotate) ── */}
      {secret ? (
        <BlurFade delay={0.1}>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconKey className="size-5 text-emerald-500" />
                <CardTitle>Device Secret Generated</CardTitle>
              </div>
              <CardDescription>
                This secret is only shown <strong>once</strong>. Copy it now — you won&apos;t see it again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <code className="block overflow-x-auto rounded-lg border border-emerald-500/20 bg-background/70 p-4 font-mono text-xs select-all">
                {secret}
              </code>
            </CardContent>
          </Card>
        </BlurFade>
      ) : null}

      {/* ── Setup Wizard (for selected device) ── */}
      {selectedDevice && secret && setupBundle ? (
        <BlurFade delay={0.15}>
          <div className="space-y-6">
            <FirmwareFlasher
              deviceId={selectedDevice.id}
              deviceName={selectedDevice.name}
              deviceSecret={secret}
              apiBaseUrl={appOrigin}
              bootstrapUrl={`/api/device/setup/${selectedDevice.id}/bootstrap?secret=${encodeURIComponent(secret)}`}
              bundleUrl={`/api/device/setup/${selectedDevice.id}/bundle?secret=${encodeURIComponent(secret)}`}
            />
            <DeviceSetupStudio
              bootstrapCommand={setupBundle.bootstrapCommand}
              bootstrapUrl={`/api/device/setup/${selectedDevice.id}/bootstrap?secret=${encodeURIComponent(secret)}`}
              bundleUrl={`/api/device/setup/${selectedDevice.id}/bundle?secret=${encodeURIComponent(secret)}`}
              deviceId={selectedDevice.id}
              deviceName={selectedDevice.name}
              envPreview={setupBundle.envFile}
              scriptPreview={setupBundle.bootstrapScript}
            />
          </div>
        </BlurFade>
      ) : null}

      {selectedDevice && !secret ? (
        <BlurFade delay={0.1}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconInfoCircle className="size-5 text-amber-500" />
                <CardTitle>Setup studio locked</CardTitle>
              </div>
              <CardDescription>
                The raw device secret is only shown once after creation. Click <strong>Rotate secret</strong> on
                the device card below to generate a new bootstrap bundle.
              </CardDescription>
            </CardHeader>
          </Card>
        </BlurFade>
      ) : null}

      {/* ── Prerequisites & Add Device ── */}
      <BlurFade delay={0.15}>
        <Card className="border-border/70 bg-card/88 overflow-hidden">
          <div className="border-b border-blue-500/10 bg-blue-500/[0.03] px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              <IconInfoCircle className="size-4" />
              Before you start
            </div>
            <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">1</span>
                <span>Get a <strong>Raspberry Pi 4B</strong> or <strong>3B+</strong> with a microSD card (16 GB+)</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">2</span>
                <span>Flash{" "}
                  <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noopener noreferrer" className="underline font-medium text-foreground">
                    Raspberry Pi OS (64-bit)
                  </a>{" "}using Raspberry Pi Imager. <strong>Enable SSH</strong> and <strong>set WiFi</strong> in the imager.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">3</span>
                <span>Insert the SD card, power on the Pi, and wait ~60s for it to boot and connect to WiFi</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-500">4</span>
                <span>Create a device below, then follow the setup wizard to install Herm on your Pi</span>
              </div>
            </div>
          </div>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconPlus className="size-5 text-primary" />
              <CardTitle>Add a new device</CardTitle>
            </div>
            <CardDescription>
              Give your Pi a name and choose a profile. You&apos;ll get a one-time setup secret and install wizard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createDevice} className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="name">Device name</Label>
                <Input id="name" name="name" placeholder='e.g. "Front dashcam", "Garage Pi"' required />
              </div>
              <div className="w-48 space-y-2">
                <Label htmlFor="profile">Profile</Label>
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
              <Button type="submit" className="gap-2">
                <IconPlus className="size-4" />
                Create device
              </Button>
            </form>
          </CardContent>
        </Card>
      </BlurFade>

      {/* ── Hardware Guide ── */}
      <BlurFade delay={0.2}>
        <Card className="border-border/70 bg-card/88">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconCpu className="size-5 text-purple-500" />
              <CardTitle>Supported hardware</CardTitle>
            </div>
            <CardDescription>Herm auto-detects these peripherals at boot. Plug in what you have.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <IconGps className="size-4 text-blue-500" /> GPS Antenna
                </div>
                <p className="text-xs text-muted-foreground">5 V UART GPS on <code className="text-[10px]">/dev/ttyAMA0</code>. No SIM needed — works standalone.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <IconCamera className="size-4 text-emerald-500" /> Cameras
                </div>
                <p className="text-xs text-muted-foreground">CSI ribbon (front) + USB webcam (rear). Runs ALPR plate detection on-device.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <IconWifi className="size-4 text-amber-500" /> SIM7600 4G (optional)
                </div>
                <p className="text-xs text-muted-foreground">Cellular connectivity when WiFi isn&apos;t available. Plugs into USB ports.</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <IconCpu className="size-4 text-rose-500" /> Raspberry Pi
                </div>
                <p className="text-xs text-muted-foreground">Pi 4 Model B (recommended) or Pi 3B+. 2 GB RAM minimum.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </BlurFade>

      {/* ── Device List ── */}
      {devices.length === 0 ? (
        <BlurFade delay={0.25}>
          <EmptyState
            icon={<IconDevices2 className="size-8" />}
            title="No devices yet"
            description="Create your first device above to get started with the setup wizard."
          />
        </BlurFade>
      ) : (
        <div className="space-y-4">
          <BlurFade delay={0.25}>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <IconDevices2 className="size-5" />
              Your devices
              <span className="text-sm font-normal text-muted-foreground">({devices.length})</span>
            </h2>
          </BlurFade>

          {devices.map((device, i) => {
            const effectiveStatus = getEffectiveDeviceStatus(device)
            const isOnline = effectiveStatus === "online"
            const activeSecrets = device.device_secrets.filter((s) => !s.revoked_at).length

            return (
              <BlurFade key={device.id} delay={0.3 + i * 0.05}>
                <Card className={`border-border/70 bg-card/88 transition-all hover:shadow-md ${isOnline ? "border-l-2 border-l-emerald-500" : ""}`}>
                  <CardHeader className="gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${isOnline ? "bg-emerald-500/10" : "bg-muted/50"}`}>
                          <IconCpu className={`size-5 ${isOnline ? "text-emerald-500" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{device.name}</CardTitle>
                          <CardDescription className="font-mono text-xs">{device.id}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {device.firmware_version && (
                          <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-mono text-muted-foreground">
                            {device.firmware_version}
                          </span>
                        )}
                        <StatusPill tone={effectiveStatus}>{effectiveStatus}</StatusPill>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Metrics Grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                          <IconActivity className="size-3" /> Heartbeat
                        </div>
                        <p className="mt-1.5 text-sm font-medium">{formatRelativeStatusDate(device.last_heartbeat_at)}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                          <IconCamera className="size-3" /> Camera
                        </div>
                        <p className={`mt-1.5 text-sm font-medium ${device.is_camera_online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                          {device.is_camera_online ? "● Online" : "○ Offline"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                          <IconGps className="size-3" /> GPS
                        </div>
                        <p className={`mt-1.5 text-sm font-medium ${device.is_gps_online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                          {device.is_gps_online ? "● Online" : "○ Offline"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                          <IconMapPin className="size-3" /> Location
                        </div>
                        <p className="mt-1.5 text-sm font-medium font-mono">
                          {device.last_latitude ? `${formatCoordinate(device.last_latitude)}, ${formatCoordinate(device.last_longitude)}` : "No fix"}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                      <Button asChild size="sm" className="gap-1.5">
                        <a href={`/dashboard/devices/${device.id}`}>
                          <IconExternalLink className="size-3.5" />
                          Live view
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={`/dashboard/devices?device=${device.id}`}>
                          <IconSettings className="size-3.5" />
                          Setup wizard
                        </a>
                      </Button>
                      <form action={rotateDeviceSecret}>
                        <input name="deviceId" type="hidden" value={device.id} />
                        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
                          <IconRefresh className="size-3.5" />
                          Rotate secret
                        </Button>
                      </form>
                      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IconKey className="size-3" />
                        {activeSecrets} active secret{activeSecrets !== 1 ? "s" : ""}
                      </div>
                      <form action={deleteDevice} className="ml-2">
                        <input name="deviceId" type="hidden" value={device.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <IconTrash className="size-3.5" />
                          Delete
                        </Button>
                      </form>
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
