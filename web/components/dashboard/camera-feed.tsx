"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconCamera,
  IconCameraOff,
  IconPlayerRecord,
  IconPlayerStop,
  IconRefresh,
} from "@tabler/icons-react"

import { createBrowserSupabaseClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"

type CameraFrame = {
  role: string
  name: string | null
  frame: string | null
  lastUpdate: number // timestamp ms
}

export function CameraFeed({
  deviceId,
  isOnline,
  isCameraOnline,
}: {
  deviceId: string
  isOnline: boolean
  isCameraOnline: boolean
}) {
  const framesRef = useRef<Map<string, CameraFrame>>(new Map())
  const [cameras, setCameras] = useState<CameraFrame[]>([])
  const [fps, setFps] = useState(0)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingRole, setRecordingRole] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeImgRef = useRef<HTMLImageElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const frameCountRef = useRef(0)
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Subscribe to Supabase Realtime Broadcast for live frames
  useEffect(() => {
    if (!isOnline || !deviceId) return

    const supabase = createBrowserSupabaseClient()
    const channelName = `device-frames:${deviceId}`

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    })

    channel.on("broadcast", { event: "frame" }, (msg) => {
      const { role, camera_name, frame } = msg.payload as {
        role: string
        camera_name: string
        frame: string
      }
      if (!frame) return

      frameCountRef.current++
      framesRef.current.set(role, {
        role,
        name: camera_name || null,
        frame,
        lastUpdate: Date.now(),
      })
      // Throttle React re-renders to ~20/s max via requestAnimationFrame
      requestAnimationFrame(() => {
        setCameras(Array.from(framesRef.current.values()))
      })
    })

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true)
        setLoading(false)
      }
    })

    // FPS counter
    fpsIntervalRef.current = setInterval(() => {
      setFps(frameCountRef.current)
      frameCountRef.current = 0
    }, 1000)

    setLoading(true)

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current)
      setConnected(false)
    }
  }, [isOnline, deviceId])

  // HTTP fallback: fetch last frame from DB if realtime hasn't delivered yet
  const fetchFallback = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/frame`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        for (const cam of data.cameras || []) {
          if (cam.frame && !framesRef.current.has(cam.role)) {
            framesRef.current.set(cam.role, {
              role: cam.role,
              name: cam.name,
              frame: cam.frame,
              lastUpdate: Date.now(),
            })
          }
        }
        setCameras(Array.from(framesRef.current.values()))
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  // On mount, fetch one frame from DB as initial state while realtime connects
  useEffect(() => {
    if (isOnline) {
      setLoading(true)
      fetchFallback()
    }
  }, [isOnline, fetchFallback])

  // If realtime delivers no frames for 5s, poll DB as fallback
  useEffect(() => {
    if (!isOnline || !connected) return
    const fallbackTimer = setInterval(() => {
      const now = Date.now()
      const hasRecent = Array.from(framesRef.current.values()).some(
        (f) => now - f.lastUpdate < 5000
      )
      if (!hasRecent) fetchFallback()
    }, 5000)
    return () => clearInterval(fallbackTimer)
  }, [isOnline, connected, fetchFallback])

  function startRecording(role: string, imgElement: HTMLImageElement) {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 640
    canvas.height = 480
    activeImgRef.current = imgElement

    const stream = canvas.captureStream(24)
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
    })
    mediaRecorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      a.download = `herm-${role}-${ts}.webm`
      a.click()
      URL.revokeObjectURL(url)
    }

    recorder.start(100)
    setRecording(true)
    setRecordingRole(role)
    setRecordingTime(0)

    const drawFrame = () => {
      if (!activeImgRef.current || !mediaRecorderRef.current) return
      try {
        ctx.drawImage(activeImgRef.current, 0, 0, canvas.width, canvas.height)
      } catch {
        // img not loaded
      }
    }
    const frameInterval = setInterval(drawFrame, 1000 / 24)
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    ;(recorder as unknown as Record<string, unknown>)._frameInterval = frameInterval
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current
      const frameInterval = (recorder as unknown as Record<string, unknown>)
        ._frameInterval as ReturnType<typeof setInterval>
      if (frameInterval) clearInterval(frameInterval)
      recorder.stop()
      mediaRecorderRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    setRecordingRole(null)
    setRecordingTime(0)
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0")
    const s = (sec % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  const activeCameras = cameras.filter((c) => c.frame)

  if (!isOnline) {
    return (
      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="gap-2">
          <CardDescription className="flex items-center gap-2">
            <IconCameraOff className="size-4" />
            Camera feed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Power on your Pi to view the camera feed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card/92">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardDescription className="flex items-center gap-2">
              <IconCamera className="size-4" />
              Live camera feed
              {activeCameras.length > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activeCameras.length} camera{activeCameras.length !== 1 ? "s" : ""}
                </span>
              )}
              {connected && fps > 0 && (
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-sky-500">
                  {fps} fps
                </span>
              )}
              {isCameraOnline && activeCameras.length === 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {connected ? "Waiting for frames" : "Connecting..."}
                </span>
              )}
              {!isCameraOnline && (
                <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  Off
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setLoading(true); fetchFallback() }}
            disabled={loading}
            className="gap-1.5"
          >
            <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeCameras.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <IconCameraOff className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Looking for cameras..."
                : isCameraOnline
                  ? "Camera service is running but no frames received yet. Wait a few seconds..."
                  : "No cameras detected. Check USB connections and run: sudo herm-diag cameras"}
            </p>
          </div>
        ) : (
          <div className={`grid gap-3 ${activeCameras.length === 1 ? "" : "sm:grid-cols-2"}`}>
            {activeCameras.map((cam) => (
              <div key={cam.role} className="overflow-hidden rounded-xl border border-border/70 bg-black">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-white/70">{cam.role}</p>
                    {cam.name && (
                      <span className="text-[10px] text-white/40">{cam.name}</span>
                    )}
                    {recording && recordingRole === cam.role && (
                      <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                        <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                        REC {formatTime(recordingTime)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {recording && recordingRole === cam.role ? (
                      <button
                        onClick={stopRecording}
                        className="rounded bg-red-500/80 px-1.5 py-0.5 text-xs text-white hover:bg-red-500 flex items-center gap-1"
                      >
                        <IconPlayerStop className="size-3" />
                        Stop
                      </button>
                    ) : !recording ? (
                      <button
                        onClick={(e) => {
                          const container = (e.target as HTMLElement).closest("[data-cam-role]")
                          const img = container?.querySelector("img")
                          if (img) startRecording(cam.role, img)
                        }}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/20 hover:text-white flex items-center gap-1"
                      >
                        <IconPlayerRecord className="size-3 text-red-400" />
                        Rec
                      </button>
                    ) : null}
                  </div>
                </div>
                <div data-cam-role={cam.role}>
                  {cam.frame ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`data:image/jpeg;base64,${cam.frame}`}
                      alt={`${cam.role} camera`}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-video flex items-center justify-center text-white/40 text-sm">
                      No frame
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  )
}
