import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { getOwnedDevice } from "@/lib/devices"
import { buildDeviceSetupBundle } from "@/lib/device-setup"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const user = await requireUser()
  const { deviceId } = await params
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")?.trim()

  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing device secret." }, { status: 400 })
  }

  const device = await getOwnedDevice(deviceId, user.id)
  const bundle = buildDeviceSetupBundle({
    apiBaseUrl: url.origin,
    bootstrapUrl: `${url.origin}/api/device/setup/${deviceId}/bootstrap?secret=${encodeURIComponent(secret)}`,
    deviceId: device.id,
    deviceName: device.name,
    deviceSecret: secret,
  })

  return NextResponse.json(
    {
      ok: true,
      device: {
        id: device.id,
        name: device.name,
      },
      files: {
        "README.md": bundle.readme,
        "device.env": bundle.envFile,
        "herm-heartbeat.sh": bundle.heartbeatScript,
        "herm-heartbeat.service": bundle.serviceFile,
        "herm-heartbeat.timer": bundle.timerFile,
        "bootstrap.sh": bundle.bootstrapScript,
      },
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="herm-${device.id}-setup.json"`,
        "Cache-Control": "no-store",
      },
    }
  )
}
