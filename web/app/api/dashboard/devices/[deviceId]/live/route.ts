import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { getOwnedDeviceWithLiveData } from "@/lib/device-live"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const user = await requireUser()
  const { deviceId } = await params

  try {
    const live = await getOwnedDeviceWithLiveData(user.id, deviceId)

    return NextResponse.json({
      ok: true,
      ...live,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load live device data.",
      },
      { status: 404 }
    )
  }
}
