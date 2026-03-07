import { NextResponse } from "next/server"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { buildDeviceSetupBundle } from "@/lib/device-setup"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")?.trim()

  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing device secret." }, { status: 400 })
  }

  const auth = await authenticateDeviceSecret(secret)

  if (!auth || auth.deviceId !== deviceId) {
    return NextResponse.json({ ok: false, error: "Invalid device secret." }, { status: 401 })
  }

  const device = auth.device
  const bundle = buildDeviceSetupBundle({
    apiBaseUrl: url.origin,
    bootstrapUrl: `${url.origin}/api/device/setup/${deviceId}/bootstrap?secret=${encodeURIComponent(secret)}`,
    deviceId: device.id,
    deviceName: device.name,
    deviceSecret: secret,
  })

  return new NextResponse(bundle.bootstrapScript, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Content-Disposition": `attachment; filename="herm-${device.id}-bootstrap.sh"`,
      "Cache-Control": "no-store",
    },
  })
}
