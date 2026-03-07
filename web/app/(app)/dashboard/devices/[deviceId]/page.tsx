import {
  IconArrowLeft,
  IconTrash,
  IconSettings,
  IconRefresh,
} from "@tabler/icons-react"

import { deleteDevice, rotateDeviceSecret } from "@/app/(app)/dashboard/actions"
import { DeviceLiveDashboard } from "@/components/dashboard/device-live-dashboard"
import { PageHeader } from "@/components/dashboard/page-header"
import { StatusPill } from "@/components/dashboard/status-pill"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getEffectiveDeviceStatus } from "@/lib/devices"
import { requireUser } from "@/lib/auth"
import { getOwnedDeviceWithLiveData } from "@/lib/device-live"

export default async function DeviceLivePage({
  params,
}: {
  params: Promise<{ deviceId: string }>
}) {
  const user = await requireUser()
  const { deviceId } = await params
  const liveData = await getOwnedDeviceWithLiveData(user.id, deviceId)
  const device = liveData.device
  const effectiveStatus = getEffectiveDeviceStatus(device)
  const createdDate = new Date(device.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Devices"
        title={device.name}
        description={`Live monitoring for ${device.name}. Auto-refreshes every 5 seconds.`}
      />

      {/* ── Device Info Bar ── */}
      <BlurFade delay={0.05}>
        <Card className="border-border/70 bg-card/88">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <StatusPill tone={effectiveStatus}>{effectiveStatus}</StatusPill>
              <div>
                <span className="text-muted-foreground">ID </span>
                <span className="font-mono text-xs">{device.id}</span>
              </div>
              {device.firmware_version && (
                <div>
                  <span className="text-muted-foreground">Firmware </span>
                  <span className="font-mono text-xs">{device.firmware_version}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Registered </span>
                <span>{createdDate}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Camera </span>
                <span className={device.is_camera_online ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {device.is_camera_online ? "● On" : "○ Off"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">GPS </span>
                <span className={device.is_gps_online ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {device.is_gps_online ? "● On" : "○ Off"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="/dashboard/devices">
                  <IconArrowLeft className="size-3.5" />
                  All devices
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
              <form action={deleteDevice}>
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

      <DeviceLiveDashboard deviceId={deviceId} initialData={liveData} />
    </div>
  )
}
