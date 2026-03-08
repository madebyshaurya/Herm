"use client"

import { useEffect, useRef, useState } from "react"
import type { Circle, LayerGroup, Map } from "leaflet"
import {
  IconZoomIn,
  IconZoomOut,
  IconFocusCentered,
  IconMaximize,
  IconCurrentLocation,
} from "@tabler/icons-react"

import type { DeviceTrailPoint } from "@/lib/device-live"
import { Button } from "@/components/ui/button"

function accuracyColor(hdop: number | null): { stroke: string; fill: string } {
  if (hdop == null) return { stroke: "#3b82f6", fill: "rgba(59,130,246,0.12)" }
  const radiusM = hdop * 5
  if (radiusM <= 15) return { stroke: "#22c55e", fill: "rgba(34,197,94,0.12)" }
  if (radiusM <= 50) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.12)" }
  return { stroke: "#ef4444", fill: "rgba(239,68,68,0.12)" }
}

export function DeviceLiveMap({
  center,
  trail,
  hdop,
}: {
  center: { latitude: number | null; longitude: number | null }
  trail: DeviceTrailPoint[]
  hdop: number | null
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const circleRef = useRef<Circle | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true,
        touchZoom: true,
        boxZoom: true,
        keyboard: true,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 80,
      })

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
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
        circleRef.current = null
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

      if (circleRef.current) {
        circleRef.current.remove()
        circleRef.current = null
      }

      if (points.length === 0 && center.latitude == null && center.longitude == null) {
        mapRef.current.setView([43.6532, -79.3832], 4)
        return
      }

      const linePoints = points.map((entry) => [entry.latitude, entry.longitude] as [number, number])

      // Trail gradient — draw segments with fading opacity
      if (linePoints.length > 1) {
        const segmentCount = linePoints.length - 1
        for (let i = 0; i < segmentCount; i++) {
          const opacity = 0.3 + 0.6 * (i / segmentCount)
          L.polyline([linePoints[i], linePoints[i + 1]], {
            color: "#0ea5e9",
            weight: 3,
            opacity,
          }).addTo(layerGroup)
        }
      }

      // Trail dots
      points.forEach((entry, index) => {
        const isLatest = index === points.length - 1
        const marker = L.circleMarker([entry.latitude, entry.longitude], {
          radius: isLatest ? 9 : 4,
          color: isLatest ? "#0f172a" : "#0ea5e9",
          weight: isLatest ? 3 : 1.5,
          fillColor: isLatest ? "#f97316" : "#38bdf8",
          fillOpacity: isLatest ? 1 : 0.7,
        })

        if (isLatest) {
          marker.bindPopup(
            `<div style="font-size:12px;line-height:1.5">
              <strong>Current position</strong><br/>
              ${entry.latitude.toFixed(6)}, ${entry.longitude.toFixed(6)}<br/>
              ${entry.speed_kmh != null ? `Speed: ${entry.speed_kmh.toFixed(1)} km/h` : ""}
              ${entry.satellites_in_use != null ? `<br/>Sats: ${entry.satellites_in_use}` : ""}
            </div>`,
            { closeButton: false }
          )
        }

        marker.addTo(layerGroup)
      })

      // GPS accuracy circle (HDOP × 5m)
      const currentLat = center.latitude ?? points.at(-1)?.latitude ?? points[0]?.latitude
      const currentLng = center.longitude ?? points.at(-1)?.longitude ?? points[0]?.longitude

      if (currentLat != null && currentLng != null && hdop != null && hdop > 0) {
        const radiusM = hdop * 5
        const colors = accuracyColor(hdop)
        circleRef.current = L.circle([currentLat, currentLng], {
          radius: radiusM,
          color: colors.stroke,
          weight: 2,
          fillColor: colors.fill,
          fillOpacity: 0.15,
          dashArray: "4,6",
        }).addTo(mapRef.current)

        circleRef.current.bindTooltip(
          `GPS accuracy: ~${radiusM.toFixed(0)}m (HDOP ${hdop.toFixed(1)})`,
          { direction: "top", opacity: 0.9 }
        )
      }

      if (currentLat == null || currentLng == null) {
        return
      }

      if (linePoints.length > 1) {
        mapRef.current.fitBounds(L.latLngBounds(linePoints), {
          padding: [32, 32],
          maxZoom: 17,
          animate: true,
        })
        return
      }

      mapRef.current.setView([currentLat, currentLng], 15, { animate: true })
    }

    syncMap()
  }, [center.latitude, center.longitude, trail, hdop])

  // Listen for fullscreen changes (e.g. Esc key exits)
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      // Leaflet needs a resize nudge after fullscreen toggle
      setTimeout(() => mapRef.current?.invalidateSize(), 150)
    }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  function handleZoomIn() {
    mapRef.current?.zoomIn(1, { animate: true })
  }
  function handleZoomOut() {
    mapRef.current?.zoomOut(1, { animate: true })
  }
  function handleFitTrail() {
    if (!mapRef.current) return
    const pts = trail.filter((p) => p.latitude != null && p.longitude != null)
    if (pts.length === 0) return
    import("leaflet").then((L) => {
      const bounds = L.latLngBounds(pts.map((p) => [p.latitude!, p.longitude!]))
      mapRef.current?.fitBounds(bounds, { padding: [40, 40], maxZoom: 17, animate: true })
    })
  }
  function handleRecenter() {
    if (!mapRef.current) return
    const lat = center.latitude
    const lng = center.longitude
    if (lat != null && lng != null) {
      mapRef.current.setView([lat, lng], 16, { animate: true })
    }
  }
  function toggleFullscreen() {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-white/70"
    >
      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-[400] bg-linear-to-b from-white/90 to-transparent px-4 py-3 pointer-events-none">
        <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">Live route</p>
      </div>

      {/* Zoom / control buttons */}
      <div className="absolute right-3 top-12 z-[400] flex flex-col gap-1.5">
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur"
          onClick={handleZoomIn}
          title="Zoom in"
        >
          <IconZoomIn className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur"
          onClick={handleZoomOut}
          title="Zoom out"
        >
          <IconZoomOut className="size-4" />
        </Button>
        <div className="h-px" />
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur"
          onClick={handleRecenter}
          title="Re-center on device"
        >
          <IconCurrentLocation className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur"
          onClick={handleFitTrail}
          title="Fit entire trail"
        >
          <IconFocusCentered className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur"
          onClick={toggleFullscreen}
          title="Fullscreen"
        >
          <IconMaximize className="size-4" />
        </Button>
      </div>

      {/* HDOP legend (bottom-left) */}
      {hdop != null && center.latitude != null && (
        <div className="absolute left-3 bottom-3 z-[400] rounded-lg bg-white/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
          <span
            className="inline-block size-2 rounded-full mr-1.5"
            style={{ backgroundColor: accuracyColor(hdop).stroke }}
          />
          ~{(hdop * 5).toFixed(0)}m accuracy
        </div>
      )}

      <div
        ref={mapElementRef}
        className={`w-full transition-[height] duration-300 ${
          isFullscreen ? "h-screen" : "h-[22rem] md:h-[30rem]"
        }`}
      />
    </div>
  )
}
