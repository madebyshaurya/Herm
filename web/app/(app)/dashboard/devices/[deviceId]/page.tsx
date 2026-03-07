import { PageHeader } from "@/components/dashboard/page-header"
import { DeviceLiveDashboard } from "@/components/dashboard/device-live-dashboard"
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Devices"
        title="Live Raspberry Pi monitor"
        description="Track this module's GPS trail, satellite health, system state, and latest plate detections."
      />

      <DeviceLiveDashboard deviceId={deviceId} initialData={liveData} />
    </div>
  )
}
