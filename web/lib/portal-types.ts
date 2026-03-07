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

export type SatelliteReading = {
  prn: string
  elevation: number | null
  azimuth: number | null
  snr: number | null
}

export type DeviceTelemetrySampleRow = {
  id: string
  device_id: string
  owner_id: string
  captured_at: string
  firmware_version: string | null
  serial_connected: boolean
  serial_path: string | null
  serial_error: string | null
  fix: boolean
  fix_quality: number
  fix_mode: number
  status_text: string
  latitude: number | null
  longitude: number | null
  altitude_m: number | null
  speed_kmh: number | null
  heading_deg: number | null
  hdop: number | null
  vdop: number | null
  pdop: number | null
  satellites_in_use: number
  satellites_in_view: number
  satellites: SatelliteReading[]
  system_cpu_percent: number | null
  system_ram_used_mb: number | null
  system_ram_total_mb: number | null
  system_temp_c: number | null
  system_ip: string | null
  system_uptime_sec: number | null
  system_internet: boolean
  source: string | null
  created_at: string
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
  snapshot_url: string | null
  created_at: string
}
