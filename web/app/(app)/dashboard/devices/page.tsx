import { createDevice, rotateDeviceSecret } from "@/app/(app)/dashboard/actions"
import { DeviceSetupStudio } from "@/components/dashboard/device-setup-studio"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAppOrigin } from "@/lib/app-origin"
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Devices"
        title="Raspberry Pi module setup"
        description="Create modules, generate setup secrets, and verify heartbeat status from the dashboard."
      />

      {secret ? (
        <Card className="border-border/70 bg-card/88">
          <CardHeader>
            <CardTitle>Current setup secret</CardTitle>
            <CardDescription>Copy this into the Raspberry Pi config. It will only be shown once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block overflow-x-auto rounded-lg border border-border bg-background/70 p-4 text-xs">
              {secret}
            </code>
            <p className="text-sm text-muted-foreground">
              Store it in the module configuration as `device_secret`.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {selectedDevice && secret && setupBundle ? (
        <DeviceSetupStudio
          bootstrapCommand={setupBundle.bootstrapCommand}
          bootstrapUrl={`/api/device/setup/${selectedDevice.id}/bootstrap?secret=${encodeURIComponent(secret)}`}
          bundleUrl={`/api/device/setup/${selectedDevice.id}/bundle?secret=${encodeURIComponent(secret)}`}
          deviceId={selectedDevice.id}
          deviceName={selectedDevice.name}
          envPreview={setupBundle.envFile}
          scriptPreview={setupBundle.bootstrapScript}
        />
      ) : null}

      {selectedDevice && !secret ? (
        <Card className="border-border/70 bg-card/88">
          <CardHeader>
            <CardTitle>Setup studio locked</CardTitle>
            <CardDescription>
              The raw device secret is only shown once. Rotate the secret for this device to generate a fresh
              bootstrap bundle and auto-authenticated setup command.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/88">
        <CardHeader>
          <CardTitle>Add a device</CardTitle>
          <CardDescription>
            Create a module record, open the setup studio, and download an auto-linked bootstrap bundle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDevice} className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name">Device name</Label>
              <Input id="name" name="name" placeholder="Front driveway module" required />
            </div>
            <Button type="submit">Create device</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {devices.map((device) => (
          <Card key={device.id} className="border-border/70 bg-card/88">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{device.name}</CardTitle>
                  <CardDescription>ID {device.id}</CardDescription>
                </div>
                <StatusPill tone={device.status}>{device.status}</StatusPill>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Heartbeat</p>
                  <p className="mt-2 text-sm">{formatRelativeStatusDate(device.last_heartbeat_at)}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Camera / GPS</p>
                  <p className="mt-2 text-sm">
                    {device.is_camera_online ? "Camera online" : "Camera offline"} ·{" "}
                    {device.is_gps_online ? "GPS online" : "GPS offline"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Last coordinates</p>
                  <p className="mt-2 text-sm">
                    {formatCoordinate(device.last_latitude)}, {formatCoordinate(device.last_longitude)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/45 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active secrets</p>
                  <p className="mt-2 text-sm">
                    {device.device_secrets.filter((secretRow) => !secretRow.revoked_at).length}
                  </p>
                </div>
              </div>
                <div className="rounded-lg border border-border/70 bg-background/45 p-4">
                  <p className="text-sm text-muted-foreground">
                    Rotate the setup secret if the module is reprovisioned or you suspect the config was exposed.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <a href={`/dashboard/devices?device=${device.id}`}>Open setup</a>
                    </Button>
                    <form action={rotateDeviceSecret}>
                      <input name="deviceId" type="hidden" value={device.id} />
                      <Button type="submit" variant="outline">
                        Rotate secret
                      </Button>
                    </form>
                  </div>
                </div>
              </CardContent>
            </Card>
        ))}
      </div>
    </div>
  )
}
