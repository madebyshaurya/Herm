import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { DeviceRow } from "@/lib/portal-types"

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

export function getEffectiveDeviceStatus(device: Pick<DeviceRow, "status" | "last_heartbeat_at">) {
  if (!device.last_heartbeat_at) {
    return device.status
  }

  const lastHeartbeatMs = new Date(device.last_heartbeat_at).getTime()

  if (Number.isNaN(lastHeartbeatMs)) {
    return device.status
  }

  return Date.now() - lastHeartbeatMs <= ONLINE_THRESHOLD_MS ? "online" : "offline"
}

export async function getOwnedDevice(deviceId: string, ownerId: string) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("id", deviceId)
    .eq("owner_id", ownerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error("Device not found.")
  }

  return data
}
