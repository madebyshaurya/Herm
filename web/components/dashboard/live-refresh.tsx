"use client"

import { useEffect } from "react"
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { createBrowserSupabaseClient } from "@/lib/supabase/browser"
import { formatCoordinate, formatDateTime, formatPlate } from "@/lib/format"

type HumanDetectionToastEvent = {
  id: string
  confidence: number | null
  latitude: number | null
  longitude: number | null
  detected_at: string
}

type PlateSightingToastEvent = {
  id: string
  normalized_plate: string
  confidence: number | null
  latitude: number | null
  longitude: number | null
  detected_at: string
}

function formatAlertLocation(latitude: number | null, longitude: number | null) {
  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
}

export function LiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    const channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () =>
        router.refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "stolen_reports" }, () =>
        router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "plate_sightings" },
        (payload: RealtimePostgresInsertPayload<PlateSightingToastEvent>) => {
          const sighting = payload.new
          toast.error(`Found plate ${formatPlate(sighting.normalized_plate)}`, {
            description: `${formatAlertLocation(sighting.latitude, sighting.longitude)} • ${formatDateTime(sighting.detected_at)}`,
            action: {
              label: "Open alerts",
              onClick: () => router.push("/dashboard/alerts"),
            },
          })
          router.refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "plate_sightings" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "plate_sightings" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "human_detection_events" },
        (payload: RealtimePostgresInsertPayload<HumanDetectionToastEvent>) => {
          const event = payload.new
          const confidenceText =
            event.confidence == null ? null : `${Math.round(event.confidence * 100)}% confidence`
          const details = [
            formatAlertLocation(event.latitude, event.longitude),
            confidenceText,
            formatDateTime(event.detected_at),
          ].filter(Boolean)

          toast.warning("Suspicious activity detected", {
            description: details.join(" • "),
            action: {
              label: "Open alerts",
              onClick: () => router.push("/dashboard/alerts"),
            },
          })
          router.refresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "human_detection_events" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "human_detection_events" },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
