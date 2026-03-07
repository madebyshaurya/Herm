"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth"
import { generateDeviceSecret } from "@/lib/device-secrets"
import { uploadFileToBucket } from "@/lib/media"
import { normalizePlate } from "@/lib/plates"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { deviceSchema, stolenReportSchema, vehicleSchema } from "@/lib/validators"

function revalidateDashboard() {
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/vehicles")
  revalidatePath("/dashboard/devices")
  revalidatePath("/dashboard/sightings")
  revalidatePath("/dashboard/alerts")
}

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

function optionalFile(formData: FormData, key: string) {
  const value = formData.get(key)
  return value instanceof File && value.size > 0 ? value : null
}

async function assertOwnedVehicle(vehicleId: string, ownerId: string) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("owner_id", ownerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error("Vehicle not found.")
  }

  return data
}

export async function signOut() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect("/")
}

export async function createVehicle(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const parsed = vehicleSchema.parse({
    nickname: optionalText(formData, "nickname"),
    plateRaw: optionalText(formData, "plateRaw"),
    make: optionalText(formData, "make"),
    model: optionalText(formData, "model"),
    color: optionalText(formData, "color"),
    notes: optionalText(formData, "notes"),
  })

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      owner_id: user.id,
      nickname: parsed.nickname || null,
      plate_raw: parsed.plateRaw,
      plate_normalized: normalizePlate(parsed.plateRaw),
      make: parsed.make || null,
      model: parsed.model || null,
      color: parsed.color || null,
      notes: parsed.notes || null,
    })
    .select("*")
    .single()

  if (error) {
    throw error
  }

  const photo = optionalFile(formData, "photo")
  if (photo) {
    const upload = await uploadFileToBucket(photo, "vehicle-media", `vehicles/${user.id}`)

    await supabase
      .from("vehicles")
      .update({
        photo_path: upload.path,
        photo_url: upload.publicUrl,
      })
      .eq("id", data.id)
      .eq("owner_id", user.id)
  }

  revalidateDashboard()
}

export async function updateVehicle(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const vehicleId = optionalText(formData, "vehicleId")
  await assertOwnedVehicle(vehicleId, user.id)
  const parsed = vehicleSchema.parse({
    nickname: optionalText(formData, "nickname"),
    plateRaw: optionalText(formData, "plateRaw"),
    make: optionalText(formData, "make"),
    model: optionalText(formData, "model"),
    color: optionalText(formData, "color"),
    notes: optionalText(formData, "notes"),
  })

  const photo = optionalFile(formData, "photo")
  let photoFields: Record<string, string | null> = {}

  if (photo) {
    const upload = await uploadFileToBucket(photo, "vehicle-media", `vehicles/${user.id}`)
    photoFields = {
      photo_path: upload.path,
      photo_url: upload.publicUrl,
    }
  }

  const { error } = await supabase
    .from("vehicles")
    .update({
      nickname: parsed.nickname || null,
      plate_raw: parsed.plateRaw,
      plate_normalized: normalizePlate(parsed.plateRaw),
      make: parsed.make || null,
      model: parsed.model || null,
      color: parsed.color || null,
      notes: parsed.notes || null,
      ...photoFields,
    })
    .eq("id", vehicleId)
    .eq("owner_id", user.id)

  if (error) {
    throw error
  }

  revalidateDashboard()
}

export async function openStolenReport(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const parsed = stolenReportSchema.parse({
    vehicleId: optionalText(formData, "vehicleId"),
    notes: optionalText(formData, "notes"),
  })
  const vehicle = await assertOwnedVehicle(parsed.vehicleId, user.id)

  const { error } = await supabase.from("stolen_reports").insert({
    vehicle_id: vehicle.id,
    owner_id: user.id,
    status: "active",
    notes: parsed.notes || null,
  })

  if (error) {
    throw error
  }

  revalidateDashboard()
}

export async function closeStolenReport(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const reportId = optionalText(formData, "reportId")

  const { error } = await supabase
    .from("stolen_reports")
    .update({
      status: "recovered",
      recovered_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("owner_id", user.id)

  if (error) {
    throw error
  }

  revalidateDashboard()
}

export async function createDevice(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const parsed = deviceSchema.parse({
    name: optionalText(formData, "name"),
  })
  const secret = generateDeviceSecret()

  const { data: device, error } = await supabase
    .from("devices")
    .insert({
      owner_id: user.id,
      name: parsed.name,
    })
    .select("id")
    .single()

  if (error) {
    throw error
  }

  const { error: secretError } = await supabase.from("device_secrets").insert({
    device_id: device.id,
    secret_hash: secret.hash,
    label: "initial",
  })

  if (secretError) {
    throw secretError
  }

  revalidateDashboard()
  redirect(`/dashboard/devices?device=${device.id}&secret=${encodeURIComponent(secret.raw)}`)
}

export async function rotateDeviceSecret(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const deviceId = optionalText(formData, "deviceId")
  const secret = generateDeviceSecret()

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id")
    .eq("id", deviceId)
    .eq("owner_id", user.id)
    .single()

  if (deviceError || !device) {
    throw deviceError ?? new Error("Device not found.")
  }

  const { error: revokeError } = await supabase
    .from("device_secrets")
    .update({ revoked_at: new Date().toISOString() })
    .eq("device_id", deviceId)

  if (revokeError) {
    throw revokeError
  }

  const { error } = await supabase.from("device_secrets").insert({
    device_id: deviceId,
    secret_hash: secret.hash,
    label: "rotated",
  })

  if (error) {
    throw error
  }

  revalidateDashboard()
  redirect(`/dashboard/devices?device=${deviceId}&secret=${encodeURIComponent(secret.raw)}`)
}

export async function deleteDevice(formData: FormData) {
  const user = await requireUser()
  const supabase = await createServerSupabaseClient()
  const deviceId = optionalText(formData, "deviceId")

  if (!deviceId) throw new Error("Missing device ID.")

  // Verify ownership
  const { data: device, error: lookupErr } = await supabase
    .from("devices")
    .select("id")
    .eq("id", deviceId)
    .eq("owner_id", user.id)
    .single()

  if (lookupErr || !device) {
    throw lookupErr ?? new Error("Device not found or not owned by you.")
  }

  // Delete cascade: secrets, telemetry samples, then device
  await supabase.from("device_secrets").delete().eq("device_id", deviceId)
  await supabase.from("device_telemetry_samples").delete().eq("device_id", deviceId)
  await supabase.from("plate_sightings").delete().eq("device_id", deviceId)
  await supabase.from("human_detection_events").delete().eq("device_id", deviceId)
  const { error: deleteErr } = await supabase.from("devices").delete().eq("id", deviceId)

  if (deleteErr) throw deleteErr

  revalidateDashboard()
  redirect("/dashboard/devices")
}
