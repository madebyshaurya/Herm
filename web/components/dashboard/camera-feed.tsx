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
  const [cameras, setCameras] = useState<CameraFrame[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingRole, setRecordingRole] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeImgRef = useRef<HTMLImageElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latestFrameRef = useRef<Map<string, CameraFrame>>(new Map())

  // HTTP polling — the primary reliable method
  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/devices/${deviceId}/frame`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        const cams: CameraFrame[] = (data.cameras || [])
          .filter((c: { hasFrame: boolean }) => c.hasFrame)
          .map((c: { role: string; name: string | null; frame: string | null }) => ({
            role: c.role,
            name: c.name,
            frame: c.frame,
          }))
        if (cams.length > 0) {
          for (const c of cams) latestFrameRef.current.set(c.role, c)
          setCameras(Array.from(latestFrameRef.current.values()))
        }
      }
    } catch {
      // Backend unreachable
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  // Poll every 1 second — reliable, works guaranteed
  useEffect(() => {
    if (!isOnline) return
    setLoading(true)
    fetchCameras()
    const timer = setInterval(fetchCameras, 1000)
    return () => clearInterval(timer)
  }, [isOnline, fetchCameras])

  // Bonus: Supabase Realtime for faster updates when available
  useEffect(() => {
    if (!isOnline || !deviceId) return
    let channel: ReturnType<ReturnType<typeof createBrowserSupabaseClient>["channel"]> | null = null

    try {
      const supabase = createBrowserSupabaseClient()
      channel = supabase.channel(`device-frames:${deviceId}`, {
        config: { broadcast: { self: false } },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.on("broadcast", { event: "frame" }, (msg: any) => {
        const { role, camera_name, frame } = msg.payload as {
          role: string
          camera_name: string
          frame: string
        }
        if (!frame) return
        latestFrameRef.current.set(role, { role, name: camera_name, frame })
        setCameras(Array.from(latestFrameRef.current.values()))
      })
      channel.subscribe()
    } catch {
      // Realtime not available — HTTP polling handles it
    }

    return () => {
      if (channel) {
        try {
          const supabase = createBrowserSupabaseClient()
          channel.unsubscribe()
          supabase.removeChannel(channel)
        } catch {}
      }
    }
  }, [isOnline, deviceId])

  function startRecording(role: string, imgElement: HTMLImageElement) {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 640
    canvas.height = 480
    activeImgRef.current = imgElement

    const stream = canvas.captureStream(15)
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
      } catch {}
    }
    const frameInterval = setInterval(drawFrame, 1000 / 15)
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
              {isCameraOnline && activeCameras.length === 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Waiting for frames
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
            onClick={() => { setLoading(true); fetchCameras() }}
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
