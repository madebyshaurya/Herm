import type {
  DeviceRow,
  HumanDetectionEventRow,
  PlateSightingRow,
  StolenReportRow,
  VehicleRow,
} from "@/lib/portal-types"
import { getEffectiveDeviceStatus } from "@/lib/devices"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function getOverviewData(userId: string) {
  const supabase = await createServerSupabaseClient()

  const [activeReports, devices, latestMatch, latestAlert] = await Promise.all([
    supabase
      .from("stolen_reports")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "active"),
    supabase.from("devices").select("id, status, last_heartbeat_at").eq("owner_id", userId),
    supabase
      .from("plate_sightings")
      .select("*")
      .eq("matched_profile_id", userId)
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle<PlateSightingRow>(),
    supabase
      .from("human_detection_events")
      .select("*")
      .eq("owner_id", userId)
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle<HumanDetectionEventRow>(),
  ])

  const deviceRows = (devices.data ?? []) as DeviceRow[]
  const onlineDevices = deviceRows.filter((device) => getEffectiveDeviceStatus(device) === "online").length

  return {
    activeReportCount: activeReports.count ?? 0,
    deviceCount: deviceRows.length,
    onlineDeviceCount: onlineDevices,
    latestMatch: latestMatch.data ?? null,
    latestAlert: latestAlert.data ?? null,
  }
}

export async function getVehiclesData(userId: string) {
  const supabase = await createServerSupabaseClient()
  const [vehiclesResult, reportsResult] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("stolen_reports")
      .select("*")
      .eq("owner_id", userId)
      .order("reported_at", { ascending: false }),
  ])

  return {
    vehicles: (vehiclesResult.data ?? []) as VehicleRow[],
    reports: (reportsResult.data ?? []) as StolenReportRow[],
  }
}

export async function getDevicesData(userId: string) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("devices")
    .select("*, device_secrets(id, created_at, last_used_at, revoked_at)")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })

  return (data ?? []) as Array<
    DeviceRow & {
      device_secrets: Array<{
        id: string
        created_at: string
        last_used_at: string | null
        revoked_at: string | null
      }>
    }
  >
}

export async function getSightingsData(userId: string) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("plate_sightings")
    .select("*")
    .or(`owner_id.eq.${userId},matched_profile_id.eq.${userId}`)
    .order("detected_at", { ascending: false })
    .limit(50)

  return (data ?? []) as PlateSightingRow[]
}

export async function getAlertsData(userId: string) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from("human_detection_events")
    .select("*")
    .eq("owner_id", userId)
    .order("detected_at", { ascending: false })
    .limit(50)

  return (data ?? []) as HumanDetectionEventRow[]
}
