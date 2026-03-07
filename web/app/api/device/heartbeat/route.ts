import { NextResponse } from "next/server"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { heartbeatSchema } from "@/lib/validators"
import { isServiceRoleConfigured } from "@/lib/env"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured for device ingest." },
      { status: 503 }
    )
  }

  const payload = heartbeatSchema.parse(await request.json())
  const auth = await authenticateDeviceSecret(payload.device_secret)

  if (!auth) {
    return NextResponse.json({ ok: false, error: "Invalid device secret" }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const status =
    payload.serial_connected || payload.is_camera_online || payload.is_gps_online
      ? "online"
      : "offline"
  const heartbeatAt = payload.timestamp || new Date().toISOString()

  const { error } = await admin
    .from("devices")
    .update({
      status,
      firmware_version: payload.firmware_version ?? null,
      is_camera_online: payload.is_camera_online,
      is_gps_online: payload.is_gps_online,
      last_latitude: payload.latitude ?? null,
      last_longitude: payload.longitude ?? null,
      last_heartbeat_at: heartbeatAt,
    })
    .eq("id", auth.deviceId)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deviceId: auth.deviceId })
}
