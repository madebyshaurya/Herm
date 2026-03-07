import { hashDeviceSecret } from "@/lib/device-secrets"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

export async function authenticateDeviceSecret(secret: string) {
  const admin = createAdminSupabaseClient()
  const secretHash = hashDeviceSecret(secret)

  const { data, error } = await admin
    .from("device_secrets")
    .select(
      "id, device_id, revoked_at, devices!inner(id, owner_id, name, status, is_camera_online, is_gps_online)"
    )
    .eq("secret_hash", secretHash)
    .is("revoked_at", null)
    .single()

  if (error || !data) {
    return null
  }

  await admin
    .from("device_secrets")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)

  return {
    secretId: data.id,
    deviceId: data.device_id,
    device: Array.isArray(data.devices) ? data.devices[0] : data.devices,
  }
}
