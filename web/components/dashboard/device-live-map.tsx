"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconZoomIn,
  IconZoomOut,
  IconFocusCentered,
  IconMaximize,
  IconCurrentLocation,
} from "@tabler/icons-react"

import type { DeviceTrailPoint } from "@/lib/device-live"
import { Button } from "@/components/ui/button"

/* ---------- helpers ---------- */

function accuracyColor(hdop: number | null): { stroke: string; fill: string } {
  if (hdop == null) return { stroke: "#3b82f6", fill: "rgba(59,130,246,0.12)" }
  const radiusM = hdop * 5
  if (radiusM <= 15) return { stroke: "#22c55e", fill: "rgba(34,197,94,0.12)" }
  if (radiusM <= 50) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.12)" }
  return { stroke: "#ef4444", fill: "rgba(239,68,68,0.12)" }
}

/* ---------- MapKit JS global types (minimal) ---------- */

declare global {
  interface Window {
    mapkit?: {
      init: (opts: { authorizationCallback: (done: (token: string) => void) => void }) => void
      Map: new (el: HTMLElement, opts?: Record<string, unknown>) => MKMap
      Coordinate: new (lat: number, lng: number) => MKCoordinate
      CoordinateRegion: new (center: MKCoordinate, span: MKCoordinateSpan) => MKCoordinateRegion
      CoordinateSpan: new (latDelta: number, lngDelta: number) => MKCoordinateSpan
      MarkerAnnotation: new (coord: MKCoordinate, opts?: Record<string, unknown>) => MKAnnotation
      CircleOverlay: new (coord: MKCoordinate, radius: number, opts?: Record<string, unknown>) => MKOverlay
      PolylineOverlay: new (coords: MKCoordinate[], opts?: Record<string, unknown>) => MKOverlay
      Style: new (opts: Record<string, unknown>) => MKStyle
      BoundingRegion: new (n: number, e: number, s: number, w: number) => MKBoundingRegion
    }
  }
}

type MKCoordinate = { latitude: number; longitude: number }
type MKCoordinateSpan = { latitudeDelta: number; longitudeDelta: number }
type MKCoordinateRegion = { center: MKCoordinate; span: MKCoordinateSpan }
type MKAnnotation = { coordinate: MKCoordinate; color: string; glyphColor: string; title: string; subtitle: string; glyphText: string; selected: boolean }
type MKOverlay = Record<string, unknown>
type MKStyle = Record<string, unknown>
type MKBoundingRegion = { northLatitude: number; eastLongitude: number; southLatitude: number; westLongitude: number }
type MKMap = {
  showsCompass: string
  showsZoomControl: boolean
  showsMapTypeControl: boolean
  showsScale: string
  isScrollEnabled: boolean
  isZoomEnabled: boolean
  isRotationEnabled: boolean
  mapType: string
  region: MKCoordinateRegion
  setRegionAnimated: (region: MKCoordinateRegion, animated?: boolean) => void
  setCenterAnimated: (coord: MKCoordinate, animated?: boolean) => void
  showItems: (items: unknown[], opts?: Record<string, unknown>) => void
  removeAnnotations: (annots: MKAnnotation[]) => void
  removeOverlays: (overlays: MKOverlay[]) => void
  addAnnotation: (annot: MKAnnotation) => MKAnnotation
  addAnnotations: (annots: MKAnnotation[]) => MKAnnotation[]
  addOverlay: (overlay: MKOverlay) => MKOverlay
  addOverlays: (overlays: MKOverlay[]) => MKOverlay[]
  annotations: MKAnnotation[]
  overlays: MKOverlay[]
  destroy: () => void
}

/* ---------- Apple Maps engine ---------- */

function useAppleMaps(
  containerRef: React.RefObject<HTMLDivElement | null>,
  center: { latitude: number | null; longitude: number | null },
  trail: DeviceTrailPoint[],
  hdop: number | null,
) {
  const mapRef = useRef<MKMap | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Load MapKit JS
  useEffect(() => {
    if (window.mapkit) {
      setReady(true)
      return
    }

    let cancelled = false
    const script = document.createElement("script")
    script.src = "https://cdn.apple.com/mapkitjs/5.x.x/mapkit.core.js"
    script.crossOrigin = "anonymous"
    script.async = true

    script.onload = () => {
      if (cancelled || !window.mapkit) {
        setFailed(true)
        return
      }
      window.mapkit.init({
        authorizationCallback: async (done) => {
          try {
            const res = await fetch("/api/mapkit-token")
            if (!res.ok) throw new Error("Token request failed")
            const { token } = await res.json()
            if (token) {
              done(token)
              if (!cancelled) setReady(true)
            } else {
              if (!cancelled) setFailed(true)
            }
          } catch {
            if (!cancelled) setFailed(true)
          }
        },
      })
    }

    script.onerror = () => {
      if (!cancelled) setFailed(true)
    }

    document.head.appendChild(script)
    return () => { cancelled = true }
  }, [])

  // Create map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current || !window.mapkit) return

    const mk = window.mapkit
    const map = new mk.Map(containerRef.current, {
      showsCompass: "Adaptive",
      showsZoomControl: false,
      showsMapTypeControl: false,
      showsScale: "Adaptive",
      isScrollEnabled: true,
      isZoomEnabled: true,
      isRotationEnabled: true,
      mapType: "mutedStandard",
    })

    mapRef.current = map

    return () => {
      map.destroy()
      mapRef.current = null
    }
  }, [ready, containerRef])

  // Sync data
  useEffect(() => {
    const map = mapRef.current
    const mk = window.mapkit
    if (!map || !mk) return

    // Clear previous
    if (map.annotations.length) map.removeAnnotations(map.annotations)
    if (map.overlays.length) map.removeOverlays(map.overlays)

    const points = trail.filter(
      (p) => p.latitude != null && p.longitude != null
    ) as Array<DeviceTrailPoint & { latitude: number; longitude: number }>

    if (points.length === 0 && center.latitude == null && center.longitude == null) {
      map.setRegionAnimated(
        new mk.CoordinateRegion(
          new mk.Coordinate(43.6532, -79.3832),
          new mk.CoordinateSpan(30, 60)
        )
      )
      return
    }

    // Trail polyline
    if (points.length > 1) {
      const coords = points.map((p) => new mk.Coordinate(p.latitude, p.longitude))
      const line = new mk.PolylineOverlay(coords, {
        style: new mk.Style({
          lineWidth: 3,
          strokeColor: "#0ea5e9",
          strokeOpacity: 0.8,
          lineCap: "round",
          lineJoin: "round",
        }),
      })
      map.addOverlay(line)
    }

    // Trail dot annotations
    points.forEach((entry, index) => {
      const isLatest = index === points.length - 1
      const coord = new mk.Coordinate(entry.latitude, entry.longitude)
      const ann = new mk.MarkerAnnotation(coord, {
        color: isLatest ? "#f97316" : "#38bdf8",
        glyphColor: "#ffffff",
        title: isLatest ? "Current position" : "",
        subtitle: isLatest
          ? `${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}${entry.speed_kmh != null ? ` · ${entry.speed_kmh.toFixed(1)} km/h` : ""}`
          : "",
        glyphText: isLatest ? "●" : "",
        selected: false,
      })
      map.addAnnotation(ann)
    })

    // HDOP accuracy circle
    const currentLat = center.latitude ?? points.at(-1)?.latitude ?? points[0]?.latitude
    const currentLng = center.longitude ?? points.at(-1)?.longitude ?? points[0]?.longitude

    if (currentLat != null && currentLng != null && hdop != null && hdop > 0) {
      const radiusM = hdop * 5
      const colors = accuracyColor(hdop)
      const circle = new mk.CircleOverlay(
        new mk.Coordinate(currentLat, currentLng),
        radiusM,
        {
          style: new mk.Style({
            strokeColor: colors.stroke,
            strokeOpacity: 0.6,
            lineWidth: 2,
            fillColor: colors.fill,
            fillOpacity: 0.15,
          }),
        }
      )
      map.addOverlay(circle)
    }

    // Fit view
    if (currentLat == null || currentLng == null) return

    if (points.length > 1) {
      const allItems = [...map.annotations, ...map.overlays]
      map.showItems(allItems, {
        padding: new (mk as unknown as Record<string, new (...args: number[]) => unknown>).Padding(40, 40, 40, 40),
        animate: true,
      })
    } else {
      map.setRegionAnimated(
        new mk.CoordinateRegion(
          new mk.Coordinate(currentLat, currentLng),
          new mk.CoordinateSpan(0.005, 0.005)
        ),
        true
      )
    }
  }, [center.latitude, center.longitude, trail, hdop, ready])

  return {
    map: mapRef,
    ready,
    failed,
    zoomIn: () => {
      const m = mapRef.current
      if (!m || !window.mapkit) return
      const span = m.region.span
      m.setRegionAnimated(
        new window.mapkit.CoordinateRegion(m.region.center, new window.mapkit.CoordinateSpan(span.latitudeDelta / 2, span.longitudeDelta / 2)),
        true
      )
    },
    zoomOut: () => {
      const m = mapRef.current
      if (!m || !window.mapkit) return
      const span = m.region.span
      m.setRegionAnimated(
        new window.mapkit.CoordinateRegion(m.region.center, new window.mapkit.CoordinateSpan(span.latitudeDelta * 2, span.longitudeDelta * 2)),
        true
      )
    },
    recenter: () => {
      const m = mapRef.current
      if (!m || !window.mapkit) return
      if (center.latitude != null && center.longitude != null) {
        m.setCenterAnimated(new window.mapkit.Coordinate(center.latitude, center.longitude), true)
      }
    },
    fitTrail: () => {
      const m = mapRef.current
      if (!m || !window.mapkit) return
      const allItems = [...m.annotations, ...m.overlays]
      if (allItems.length === 0) return
      m.showItems(allItems, { animate: true })
    },
  }
}

/* ---------- Leaflet fallback engine ---------- */

function useLeafletMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  center: { latitude: number | null; longitude: number | null },
  trail: DeviceTrailPoint[],
  hdop: number | null,
  enabled: boolean,
) {
  type LMap = import("leaflet").Map
  type LLayerGroup = import("leaflet").LayerGroup
  type LCircle = import("leaflet").Circle

  const mapRef = useRef<LMap | null>(null)
  const layerRef = useRef<LLayerGroup | null>(null)
  const circleRef = useRef<LCircle | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function setup() {
      if (!containerRef.current || mapRef.current) return
      const L = await import("leaflet")
      if (cancelled || !containerRef.current) return

      mapRef.current = L.map(containerRef.current, {
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
  }, [enabled, containerRef])

  useEffect(() => {
    if (!enabled) return

    async function syncMap() {
      if (!mapRef.current || !layerRef.current) return

      const L = await import("leaflet")
      const layerGroup = layerRef.current
      if (!layerGroup) return

      const points = trail.filter(
        (entry) => entry.latitude != null && entry.longitude != null
      ) as Array<DeviceTrailPoint & { latitude: number; longitude: number }>

      layerGroup.clearLayers()
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null }

      if (points.length === 0 && center.latitude == null && center.longitude == null) {
        mapRef.current.setView([43.6532, -79.3832], 4)
        return
      }

      const linePoints = points.map((e) => [e.latitude, e.longitude] as [number, number])

      if (linePoints.length > 1) {
        const segCount = linePoints.length - 1
        for (let i = 0; i < segCount; i++) {
          const opacity = 0.3 + 0.6 * (i / segCount)
          L.polyline([linePoints[i], linePoints[i + 1]], { color: "#0ea5e9", weight: 3, opacity }).addTo(layerGroup)
        }
      }

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
            `<div style="font-size:12px;line-height:1.5"><strong>Current position</strong><br/>${entry.latitude.toFixed(6)}, ${entry.longitude.toFixed(6)}<br/>${entry.speed_kmh != null ? `Speed: ${entry.speed_kmh.toFixed(1)} km/h` : ""}${entry.satellites_in_use != null ? `<br/>Sats: ${entry.satellites_in_use}` : ""}</div>`,
            { closeButton: false }
          )
        }
        marker.addTo(layerGroup)
      })

      const curLat = center.latitude ?? points.at(-1)?.latitude ?? points[0]?.latitude
      const curLng = center.longitude ?? points.at(-1)?.longitude ?? points[0]?.longitude

      if (curLat != null && curLng != null && hdop != null && hdop > 0) {
        const radiusM = hdop * 5
        const colors = accuracyColor(hdop)
        circleRef.current = L.circle([curLat, curLng], {
          radius: radiusM, color: colors.stroke, weight: 2,
          fillColor: colors.fill, fillOpacity: 0.15, dashArray: "4,6",
        }).addTo(mapRef.current)
        circleRef.current.bindTooltip(`GPS accuracy: ~${radiusM.toFixed(0)}m (HDOP ${hdop.toFixed(1)})`, { direction: "top", opacity: 0.9 })
      }

      if (curLat == null || curLng == null) return

      if (linePoints.length > 1) {
        mapRef.current.fitBounds(L.latLngBounds(linePoints), { padding: [32, 32], maxZoom: 17, animate: true })
      } else {
        mapRef.current.setView([curLat, curLng], 15, { animate: true })
      }
    }

    syncMap()
  }, [center.latitude, center.longitude, trail, hdop, enabled])

  return {
    map: mapRef,
    zoomIn: () => mapRef.current?.zoomIn(1, { animate: true }),
    zoomOut: () => mapRef.current?.zoomOut(1, { animate: true }),
    recenter: () => {
      if (center.latitude != null && center.longitude != null) {
        mapRef.current?.setView([center.latitude, center.longitude], 16, { animate: true })
      }
    },
    fitTrail: () => {
      const pts = trail.filter((p) => p.latitude != null && p.longitude != null)
      if (pts.length === 0 || !mapRef.current) return
      import("leaflet").then((L) => {
        mapRef.current?.fitBounds(
          L.latLngBounds(pts.map((p) => [p.latitude!, p.longitude!])),
          { padding: [40, 40], maxZoom: 17, animate: true }
        )
      })
    },
  }
}

/* ---------- Component ---------- */

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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const apple = useAppleMaps(mapElementRef, center, trail, hdop)
  const leaflet = useLeafletMap(mapElementRef, center, trail, hdop, apple.failed)

  const usingApple = apple.ready && !apple.failed
  const engine = usingApple ? apple : leaflet

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      if (!usingApple) {
        setTimeout(() => {
          const m = leaflet.map.current
          if (m && "invalidateSize" in m) (m as unknown as { invalidateSize: () => void }).invalidateSize()
        }, 150)
      }
    }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [usingApple, leaflet.map])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-3xl border border-border/70 bg-white/70"
    >
      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-[400] bg-linear-to-b from-white/90 to-transparent px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-2">
          <p className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">Live route</p>
          {usingApple && (
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              Apple Maps
            </span>
          )}
        </div>
      </div>

      {/* Zoom / control buttons */}
      <div className="absolute right-3 top-12 z-[400] flex flex-col gap-1.5">
        <Button size="icon" variant="outline" className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur" onClick={engine.zoomIn} title="Zoom in">
          <IconZoomIn className="size-4" />
        </Button>
        <Button size="icon" variant="outline" className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur" onClick={engine.zoomOut} title="Zoom out">
          <IconZoomOut className="size-4" />
        </Button>
        <div className="h-px" />
        <Button size="icon" variant="outline" className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur" onClick={engine.recenter} title="Re-center on device">
          <IconCurrentLocation className="size-4" />
        </Button>
        <Button size="icon" variant="outline" className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur" onClick={engine.fitTrail} title="Fit entire trail">
          <IconFocusCentered className="size-4" />
        </Button>
        <Button size="icon" variant="outline" className="size-8 rounded-lg bg-white/90 shadow-sm backdrop-blur" onClick={toggleFullscreen} title="Fullscreen">
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
