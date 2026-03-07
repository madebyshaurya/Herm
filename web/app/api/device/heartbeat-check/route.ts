import { NextRequest, NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { createServerSupabaseClient } from "@/lib/supabase/server"

/**
 * GET /api/device/heartbeat-check?deviceId=xxx
 *
 * Quick check if a device has sent a heartbeat recently (within 5 minutes).
 * Used by the setup wizard to poll for first connection after flashing.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser()
  const deviceId = request.nextUrl.searchParams.get("deviceId")

  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: device, error } = await supabase
    .from("devices")
    .select("id, last_heartbeat_at, status")
    .eq("id", deviceId)
    .eq("user_id", user.id)
    .single()

  if (error || !device) {
    return NextResponse.json({ ok: false, online: false })
  }

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
  })
}
