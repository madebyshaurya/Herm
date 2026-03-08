import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { isServiceRoleConfigured } from "@/lib/env"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { telemetrySchema } from "@/lib/validators"

export async function POST(request: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured for device ingest." },
      { status: 503 }
    )
  }

  let payload
  try {
    payload = telemetrySchema.parse(await request.json())
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid telemetry payload", issues: err.issues },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 })
  }

  const auth = await authenticateDeviceSecret(payload.device_secret)

  if (!auth) {
    return NextResponse.json({ ok: false, error: "Invalid device secret" }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const capturedAt = payload.timestamp || new Date().toISOString()
  const gnss = payload.gnss
  const system = payload.system

  const { error: insertError } = await admin.from("device_telemetry_samples").insert({
    device_id: auth.deviceId,
    owner_id: auth.device.owner_id,
    captured_at: capturedAt,
    firmware_version: payload.firmware_version ?? null,
    serial_connected: payload.serial.connected,
    serial_path: payload.serial.path,
    serial_error: payload.serial.lastError ?? null,
    fix: gnss.fix,
    fix_quality: gnss.fixQuality,
    fix_mode: gnss.mode,
    status_text: gnss.statusText,
    latitude: gnss.lat ?? null,
    longitude: gnss.lon ?? null,
    altitude_m: gnss.alt ?? null,
    speed_kmh: gnss.speedKmh ?? null,
    heading_deg: gnss.heading ?? null,
    hdop: gnss.hdop ?? null,
    vdop: gnss.vdop ?? null,
    pdop: gnss.pdop ?? null,
    satellites_in_use: gnss.satsInUse,
    satellites_in_view: gnss.satsInView,
    satellites: payload.satellites,
    system_cpu_percent: system.cpuPercent ?? null,
    system_ram_used_mb: system.ramUsedMb != null ? Math.round(system.ramUsedMb) : null,
    system_ram_total_mb: system.ramTotalMb != null ? Math.round(system.ramTotalMb) : null,
    system_temp_c: system.tempC ?? null,
    system_ip: system.ip ?? null,
    system_uptime_sec: system.uptimeSec ?? null,
    system_internet: system.internet,
    source: gnss.source,
  })

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
  }

  const status = payload.serial.connected || gnss.fix ? "online" : "offline"
  const { error: deviceError } = await admin
    .from("devices")
    .update({
      status,
      firmware_version: payload.firmware_version ?? null,
      is_gps_online: payload.serial.connected,
      last_latitude: gnss.lat ?? null,
      last_longitude: gnss.lon ?? null,
      last_heartbeat_at: capturedAt,
    })
    .eq("id", auth.deviceId)

  if (deviceError) {
    return NextResponse.json({ ok: false, error: deviceError.message }, { status: 500 })
  }

  await admin.rpc("prune_device_telemetry_samples", {
    target_device_id: auth.deviceId,
    keep_count: 720,
  })

  return NextResponse.json({ ok: true, deviceId: auth.deviceId, capturedAt })
}
