import { NextResponse } from "next/server"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { isServiceRoleConfigured } from "@/lib/env"
import { insertMediaAsset, uploadFileToBucket } from "@/lib/media"
import { normalizePlate } from "@/lib/plates"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { plateSightingSchema } from "@/lib/validators"

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const snapshot = formData.get("snapshot")
    return {
      payload: plateSightingSchema.parse({
        device_secret: formData.get("device_secret"),
        plateRaw: formData.get("plateRaw"),
        plateNormalized: formData.get("plateNormalized"),
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
    payload: plateSightingSchema.parse(await request.json()),
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
  const normalizedPlate = payload.plateNormalized
    ? normalizePlate(payload.plateNormalized)
    : normalizePlate(payload.plateRaw)
  const detectedAt = payload.timestamp || new Date().toISOString()
  const { data: activeReport } = await admin
    .from("stolen_reports")
    .select("id, owner_id, vehicles!inner(id, plate_normalized)")
    .eq("status", "active")
    .eq("vehicles.plate_normalized", normalizedPlate)
    .order("reported_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: sighting, error } = await admin
    .from("plate_sightings")
    .insert({
      device_id: auth.deviceId,
      owner_id: auth.device.owner_id,
      matched_profile_id: activeReport?.owner_id ?? null,
      matched_stolen_report_id: activeReport?.id ?? null,
      raw_plate: payload.plateRaw,
      normalized_plate: normalizedPlate,
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
      `sightings/${auth.device.owner_id}`
    )
    const media = await insertMediaAsset({
      ownerId: auth.device.owner_id,
      bucketId: "event-snapshots",
      upload,
      relatedType: "plate_sighting",
      relatedId: sighting.id,
    })

    snapshotUrl = media.public_url

    await admin
      .from("plate_sightings")
      .update({
        snapshot_media_id: media.id,
        snapshot_url: media.public_url,
      })
      .eq("id", sighting.id)
  }

  return NextResponse.json({
    ok: true,
    deviceId: auth.deviceId,
    matched: Boolean(activeReport?.id),
    stolenReportId: activeReport?.id ?? null,
    snapshotUrl,
  })
}
