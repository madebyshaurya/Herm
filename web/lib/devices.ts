import { createServerSupabaseClient } from "@/lib/supabase/server"

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
