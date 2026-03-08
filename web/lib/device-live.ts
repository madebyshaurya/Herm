import type { DeviceRow, DeviceTelemetrySampleRow, PlateSightingRow } from "@/lib/portal-types"
import { getRecentPlateEvents, type RecentPlateEvent } from "@/lib/recent-plate-cache"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export type DeviceTrailPoint = Pick<
  DeviceTelemetrySampleRow,
  | "id"
  | "captured_at"
  | "latitude"
  | "longitude"
  | "speed_kmh"
  | "heading_deg"
  | "fix"
  | "satellites_in_use"
  | "satellites_in_view"
>

export type DeviceHealthSnapshot = {
  heartbeatAgeSec: number | null
  telemetryAgeSec: number | null
  serialConnected: boolean
  gpsHealthy: boolean
  backendReachable: boolean
  connectionTone: "online" | "offline" | "provisioning"
}

export type DeviceLivePlateEvent = RecentPlateEvent

export type DeviceLiveData = {
  device: DeviceRow
  latestTelemetry: DeviceTelemetrySampleRow | null
  trail: DeviceTrailPoint[]
  latestPlates: DeviceLivePlateEvent[]
  health: DeviceHealthSnapshot
}

export async function getOwnedDeviceWithLiveData(ownerId: string, deviceId: string): Promise<DeviceLiveData> {
  const supabase = await createServerSupabaseClient()
  const [deviceResult, latestTelemetryResult, trailResult, latestPlatesResult] = await Promise.all([
    supabase
      .from("devices")
      .select("*")
      .eq("id", deviceId)
      .eq("owner_id", ownerId)
      .maybeSingle<DeviceRow>(),
    supabase
      .from("device_telemetry_samples")
      .select("*")
      .eq("device_id", deviceId)
      .eq("owner_id", ownerId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle<DeviceTelemetrySampleRow>(),
    supabase
      .from("device_telemetry_samples")
      .select(
        "id, captured_at, latitude, longitude, speed_kmh, heading_deg, fix, satellites_in_use, satellites_in_view"
      )
      .eq("device_id", deviceId)
      .eq("owner_id", ownerId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("captured_at", { ascending: false })
      .limit(120),
    supabase
      .from("plate_sightings")
      .select("*")
      .eq("device_id", deviceId)
      .eq("owner_id", ownerId)
      .order("detected_at", { ascending: false })
      .limit(12),
  ])

  if (deviceResult.error) {
    throw deviceResult.error
  }
  if (!deviceResult.data) {
    throw new Error("Device not found.")
  }
  if (latestTelemetryResult.error) {
    throw latestTelemetryResult.error
  }
  if (trailResult.error) {
    throw trailResult.error
  }
  if (latestPlatesResult.error) {
    throw latestPlatesResult.error
  }

  const latestTelemetry = latestTelemetryResult.data ?? null
  const trail = [...((trailResult.data ?? []) as DeviceTrailPoint[])].reverse()
  const persistedPlates = (latestPlatesResult.data ?? []) as PlateSightingRow[]
  const livePlateMap = new Map<string, DeviceLivePlateEvent>()

  for (const plate of getRecentPlateEvents(ownerId, deviceId)) {
    livePlateMap.set(plate.id, plate)
  }

  for (const plate of persistedPlates) {
    livePlateMap.set(plate.id, {
      ...plate,
      transient: false,
    })
  }

  return {
    device: deviceResult.data,
    latestTelemetry,
    trail,
    latestPlates: [...livePlateMap.values()]
      .sort((left, right) => new Date(right.detected_at).getTime() - new Date(left.detected_at).getTime())
      .slice(0, 12),
    health: buildDeviceHealth(deviceResult.data, latestTelemetry),
  }
}

function ageInSeconds(value: string | null | undefined) {
  if (!value) {
    return null
  }

  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
}

function buildDeviceHealth(device: DeviceRow, latestTelemetry: DeviceTelemetrySampleRow | null): DeviceHealthSnapshot {
  const heartbeatAgeSec = ageInSeconds(device.last_heartbeat_at)
  const telemetryAgeSec = ageInSeconds(latestTelemetry?.captured_at)
  const backendReachable = heartbeatAgeSec != null && heartbeatAgeSec < 180
  // GPS/serial are only "healthy" if the device is actually online right now
  const gpsHealthy = backendReachable && Boolean(device.is_gps_online && latestTelemetry?.serial_connected)
  const serialConnected = backendReachable && Boolean(latestTelemetry?.serial_connected)
  const connectionTone =
    device.status === "provisioning"
      ? "provisioning"
      : backendReachable
        ? "online"
        : "offline"

  return {
    heartbeatAgeSec,
    telemetryAgeSec,
    serialConnected,
    gpsHealthy,
    backendReachable,
    connectionTone,
  }
}
