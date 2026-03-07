"use client"

import { useEffect, useRef } from "react"
import type { LayerGroup, Map } from "leaflet"

import type { DeviceTrailPoint } from "@/lib/device-live"

export function DeviceLiveMap({
  center,
  trail,
}: {
  center: { latitude: number | null; longitude: number | null }
  trail: DeviceTrailPoint[]
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)

  useEffect(() => {
    let cancelled = false

    async function setup() {
      if (!mapElementRef.current || mapRef.current) {
        return
      }

      const L = await import("leaflet")

      if (cancelled || !mapElementRef.current) {
        return
      }

      mapRef.current = L.map(mapElementRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current)

      layerRef.current = L.layerGroup().addTo(mapRef.current)
    }

    setup()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    async function syncMap() {
      if (!mapRef.current || !layerRef.current) {
        return
      }

      const L = await import("leaflet")
      const layerGroup = layerRef.current

      if (!layerGroup) {
        return
      }

      const points = trail.filter(
        (entry) => entry.latitude != null && entry.longitude != null
      ) as Array<DeviceTrailPoint & { latitude: number; longitude: number }>

      layerGroup.clearLayers()

      if (points.length === 0 && center.latitude == null && center.longitude == null) {
        mapRef.current.setView([43.6532, -79.3832], 4)
        return
      }

      const linePoints = points.map((entry) => [entry.latitude, entry.longitude] as [number, number])

      if (linePoints.length > 1) {
        L.polyline(linePoints, {
          color: "#164e63",
          weight: 4,
          opacity: 0.85,
        }).addTo(layerGroup)
      }

      points.forEach((entry, index) => {
        L.circleMarker([entry.latitude, entry.longitude], {
          radius: index === points.length - 1 ? 8 : 4.5,
          color: index === points.length - 1 ? "#0f172a" : "#164e63",
          weight: 2,
          fillColor: index === points.length - 1 ? "#f97316" : "#38bdf8",
          fillOpacity: 0.9,
        }).addTo(layerGroup)
      })

      const currentLatitude = center.latitude ?? points.at(-1)?.latitude ?? points[0]?.latitude
      const currentLongitude = center.longitude ?? points.at(-1)?.longitude ?? points[0]?.longitude

      if (currentLatitude == null || currentLongitude == null) {
        return
      }

      if (linePoints.length > 1) {
        mapRef.current.fitBounds(L.latLngBounds(linePoints), {
          padding: [28, 28],
          maxZoom: 16,
        })
        return
      }

      mapRef.current.setView([currentLatitude, currentLongitude], 14)
    }

    syncMap()
  }, [center.latitude, center.longitude, trail])

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-white/70">
      <div className="absolute inset-x-0 top-0 z-[400] bg-linear-to-r from-sky-500/12 via-transparent to-orange-500/12 px-4 py-3">
        <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">Live route</p>
      </div>
      <div ref={mapElementRef} className="h-[20rem] w-full md:h-[26rem]" />
    </div>
  )
}
