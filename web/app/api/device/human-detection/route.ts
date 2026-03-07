import { NextResponse } from "next/server"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { isServiceRoleConfigured } from "@/lib/env"
import { uploadFileToBucket } from "@/lib/media"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { humanDetectionSchema } from "@/lib/validators"

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const snapshot = formData.get("snapshot")
    return {
      payload: humanDetectionSchema.parse({
        device_secret: formData.get("device_secret"),
        confidence: formData.get("confidence")
          ? Number(formData.get("confidence"))
          : null,
        latitude: formData.get("latitude") ? Number(formData.get("latitude")) : null,
        longitude: formData.get("longitude") ? Number(formData.get("longitude")) : null,
        timestamp: formData.get("timestamp"),
      }),
      snapshot: snapshot instanceof File && snapshot.size > 0 ? snapshot : null,
    }
  }

  return {
    payload: humanDetectionSchema.parse(await request.json()),
    snapshot: null,
  }
}

export async function POST(request: Request) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured for device ingest." },
      { status: 503 }
    )
  }

  const { payload, snapshot } = await parsePayload(request)
  const auth = await authenticateDeviceSecret(payload.device_secret)

  if (!auth) {
    return NextResponse.json({ ok: false, error: "Invalid device secret" }, { status: 401 })
  }

  const admin = createAdminSupabaseClient()
  const detectedAt = payload.timestamp || new Date().toISOString()

  const { data: detection, error } = await admin
    .from("human_detection_events")
    .insert({
      device_id: auth.deviceId,
      owner_id: auth.device.owner_id,
      confidence: payload.confidence ?? null,
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      detected_at: detectedAt,
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let snapshotUrl: string | null = null

  if (snapshot) {
    const upload = await uploadFileToBucket(
      snapshot,
      "event-snapshots",
      `alerts/${auth.device.owner_id}`
    )
    snapshotUrl = upload.publicUrl

    await admin
      .from("human_detection_events")
      .update({
        snapshot_url: upload.publicUrl,
      })
      .eq("id", detection.id)
  }

  return NextResponse.json({
    ok: true,
    deviceId: auth.deviceId,
    snapshotUrl,
  })
}
