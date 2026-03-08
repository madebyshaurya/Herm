import { NextResponse } from "next/server"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { isServiceRoleConfigured } from "@/lib/env"
import { uploadFileToBucket } from "@/lib/media"
import { normalizePlate } from "@/lib/plates"
import { recordRecentPlateEvents } from "@/lib/recent-plate-cache"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { plateBatchSchema, plateSightingSchema } from "@/lib/validators"

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

  const body = await request.json()

  if (Array.isArray(body?.plates)) {
    return {
      payload: plateBatchSchema.parse(body),
      snapshot: null,
    }
  }

  return {
    payload: plateSightingSchema.parse(body),
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
  const isBatchPayload = "plates" in payload
  const entries = isBatchPayload
    ? payload.plates.map((plateRaw: string) => ({
        plateRaw,
        plateNormalized: normalizePlate(plateRaw),
        confidence: payload.confidenceByPlate?.[plateRaw] ?? null,
      }))
    : [
        {
          plateRaw: payload.plateRaw,
          plateNormalized: payload.plateNormalized
            ? normalizePlate(payload.plateNormalized)
            : normalizePlate(payload.plateRaw),
          confidence: payload.confidence ?? null,
        },
      ]

  const matchedReports = await Promise.all(
    entries.map(async (entry: (typeof entries)[number]) => {
      const { data } = await admin
        .from("stolen_reports")
        .select("id, owner_id, vehicles!inner(id, plate_normalized)")
        .eq("status", "active")
        .eq("vehicles.plate_normalized", entry.plateNormalized)
        .order("reported_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      return data
    })
  )

  const matchedEntries = entries
    .map((entry: (typeof entries)[number], index: number) => ({
      entry,
      matchedReport: matchedReports[index] ?? null,
    }))
    .filter((item) => Boolean(item.matchedReport?.id))

  let sightings:
    | Array<{
        id: string
        device_id: string
        owner_id: string
        matched_profile_id: string | null
        matched_stolen_report_id: string | null
        raw_plate: string
        normalized_plate: string
        confidence: number | null
        latitude: number | null
        longitude: number | null
        detected_at: string
        snapshot_url: string | null
        created_at: string
      }>
    | null = null

  if (matchedEntries.length) {
    const { data, error } = await admin
      .from("plate_sightings")
      .insert(
        matchedEntries.map(({ entry, matchedReport }) => ({
          device_id: auth.deviceId,
          owner_id: auth.device.owner_id,
          matched_profile_id: matchedReport?.owner_id ?? null,
          matched_stolen_report_id: matchedReport?.id ?? null,
          raw_plate: entry.plateRaw,
          normalized_plate: entry.plateNormalized,
          confidence: entry.confidence,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          detected_at: detectedAt,
        }))
      )
      .select(
        "id, device_id, owner_id, matched_profile_id, matched_stolen_report_id, raw_plate, normalized_plate, confidence, latitude, longitude, detected_at, snapshot_url, created_at"
      )

    if (error || !data?.length) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Unable to insert matched sightings." },
        { status: 500 }
      )
    }

    sightings = data

    // Broadcast stolen plate alert to the vehicle owner via Realtime
    for (const sighting of sightings) {
      if (sighting.matched_profile_id) {
        admin.channel(`stolen-alert:${sighting.matched_profile_id}`).send({
          type: "broadcast",
          event: "stolen-plate-spotted",
          payload: {
            plate: sighting.normalized_plate,
            latitude: sighting.latitude,
            longitude: sighting.longitude,
            detectedAt: sighting.detected_at,
            snapshotUrl: sighting.snapshot_url,
            deviceId: sighting.device_id,
            sightingId: sighting.id,
          },
        }).catch(() => {/* best-effort */})
      }
    }
  }

  let snapshotUrl: string | null = null

  if (snapshot && sightings?.length) {
    const upload = await uploadFileToBucket(
      snapshot,
      "event-snapshots",
      `sightings/${auth.device.owner_id}`
    )
    snapshotUrl = upload.publicUrl

    await admin
      .from("plate_sightings")
      .update({
        snapshot_url: upload.publicUrl,
      })
      .in(
        "id",
        sightings.map((sighting) => sighting.id)
      )
  }

  const liveEvents = [
    ...(sightings ?? []).map((sighting) => ({
      ...sighting,
      snapshot_url: snapshotUrl ?? sighting.snapshot_url,
      transient: false,
    })),
    ...entries
      .map((entry: (typeof entries)[number], index: number) => ({
        id: `live_${auth.deviceId}_${detectedAt}_${index}_${entry.plateNormalized}`,
        device_id: auth.deviceId,
        owner_id: auth.device.owner_id,
        matched_profile_id: matchedReports[index]?.owner_id ?? null,
        matched_stolen_report_id: matchedReports[index]?.id ?? null,
        raw_plate: entry.plateRaw,
        normalized_plate: entry.plateNormalized,
        confidence: entry.confidence,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        detected_at: detectedAt,
        snapshot_url: null,
        created_at: detectedAt,
        transient: true,
      }))
      .filter((event) => !event.matched_stolen_report_id),
  ]

  recordRecentPlateEvents(liveEvents)

  return NextResponse.json({
    ok: true,
    deviceId: auth.deviceId,
    count: entries.length,
    storedCount: sightings?.length ?? 0,
    plates: entries.map((entry: (typeof entries)[number]) => entry.plateNormalized),
    matched: matchedReports.some((report) => Boolean(report?.id)),
    stolenReportIds: matchedReports.map((report) => report?.id ?? null),
    snapshotUrl,
  })
}
