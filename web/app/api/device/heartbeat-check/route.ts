import { NextRequest, NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * GET /api/device/heartbeat-check?deviceId=xxx
 *
 * Returns the device's current readiness state.
 * Used by the setup wizard to poll for progress after flashing.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser()
  const deviceId = request.nextUrl.searchParams.get("deviceId")

  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()

  const [deviceResult, telemetryResult] = await Promise.all([
    supabase
      .from("devices")
      .select("id, last_heartbeat_at, status, is_gps_online, is_camera_online, firmware_version")
      .eq("id", deviceId)
      .eq("owner_id", user.id)
      .single(),
    supabase
      .from("device_telemetry_samples")
      .select("satellites_in_use, serial_connected, fix, captured_at")
      .eq("device_id", deviceId)
      .eq("owner_id", user.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (deviceResult.error || !deviceResult.data) {
    return NextResponse.json({ ok: false, online: false })
  }

  const device = deviceResult.data
  const telemetry = telemetryResult.data

  const lastHeartbeat = device.last_heartbeat_at
    ? new Date(device.last_heartbeat_at)
    : null

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const online = lastHeartbeat !== null && lastHeartbeat > fiveMinutesAgo

  return NextResponse.json({
    ok: true,
    online,
    lastHeartbeatAt: device.last_heartbeat_at,
    status: device.status,
    firmwareVersion: device.firmware_version,
    isGpsOnline: device.is_gps_online,
    isCameraOnline: device.is_camera_online,
    serialConnected: telemetry?.serial_connected ?? false,
    hasFix: telemetry?.fix ?? false,
    satellitesInUse: telemetry?.satellites_in_use ?? 0,
    lastTelemetryAt: telemetry?.captured_at ?? null,
  })
}
