"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

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
      .on("postgres_changes", { event: "*", schema: "public", table: "plate_sightings" }, () =>
        router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "human_detection_events" },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
