import { cache } from "react"

import { isServiceRoleConfigured } from "@/lib/env"
import type { DeviceRow, PlateSightingRow } from "@/lib/portal-types"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

export const getMarketingData = cache(async () => {
  if (!isServiceRoleConfigured()) {
    return {
      ready: false,
      activeReportCount: null,
      onlineDeviceCount: null,
      recentSightingCount: null,
      latestMatch: null,
      latestHeartbeat: null,
    }
  }

  const admin = createAdminSupabaseClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [activeReports, onlineDevices, recentSightings, latestMatch, latestHeartbeat] =
    await Promise.all([
      admin
        .from("stolen_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      admin
        .from("devices")
        .select("id", { count: "exact", head: true })
        .eq("status", "online"),
      admin
        .from("plate_sightings")
        .select("id", { count: "exact", head: true })
        .gte("detected_at", since),
      admin
        .from("plate_sightings")
        .select("id, detected_at, latitude, longitude, matched_stolen_report_id")
        .not("matched_stolen_report_id", "is", null)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle<PlateSightingRow>(),
      admin
        .from("devices")
        .select("id, last_heartbeat_at, status")
        .not("last_heartbeat_at", "is", null)
        .order("last_heartbeat_at", { ascending: false })
        .limit(1)
        .maybeSingle<DeviceRow>(),
    ])

  return {
    ready: true,
    activeReportCount: activeReports.count ?? 0,
    onlineDeviceCount: onlineDevices.count ?? 0,
    recentSightingCount: recentSightings.count ?? 0,
    latestMatch: latestMatch.data ?? null,
    latestHeartbeat: latestHeartbeat.data ?? null,
  }
})
