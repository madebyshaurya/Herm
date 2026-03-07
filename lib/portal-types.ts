export type VehicleRow = {
  id: string
  owner_id: string
  plate_raw: string
  plate_normalized: string
  nickname: string | null
  make: string | null
  model: string | null
  color: string | null
  notes: string | null
  photo_path: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export type StolenReportRow = {
  id: string
  vehicle_id: string
  owner_id: string
  status: "active" | "recovered"
  reported_at: string
  recovered_at: string | null
  notes: string | null
  created_at: string
}

export type DeviceRow = {
  id: string
  owner_id: string
  name: string
  status: "provisioning" | "online" | "offline"
  firmware_version: string | null
  is_camera_online: boolean
  is_gps_online: boolean
  last_heartbeat_at: string | null
  last_latitude: number | null
  last_longitude: number | null
  created_at: string
  updated_at: string
}

export type PlateSightingRow = {
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
  snapshot_media_id: string | null
  snapshot_url: string | null
  created_at: string
}

export type HumanDetectionEventRow = {
  id: string
  device_id: string
  owner_id: string
  confidence: number | null
  latitude: number | null
  longitude: number | null
  detected_at: string
  snapshot_media_id: string | null
  snapshot_url: string | null
  created_at: string
}
