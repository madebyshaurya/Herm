"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconCamera,
  IconCameraOff,
  IconPlayerRecord,
  IconPlayerStop,
  IconDownload,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function CameraFeed({
  piIp,
  deviceId,
  isOnline,
  isCameraOnline,
}: {
  piIp: string | null
  deviceId: string
  isOnline: boolean
  isCameraOnline: boolean
}) {
  const [manualIp, setManualIp] = useState("")
  const [connected, setConnected] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [showAnnotated, setShowAnnotated] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frontImgRef = useRef<HTMLImageElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const effectiveIp = piIp || manualIp

  useEffect(() => {
    const saved = localStorage.getItem(`herm-pi-ip-${deviceId}`)
    if (saved) {
      setManualIp(saved)
      setConnected(true)
    }
  }, [deviceId])

  // Auto-connect when we have a Pi IP from telemetry
  useEffect(() => {
    if (piIp && !connected) {
      setConnected(true)
    }
  }, [piIp, connected])

  const streamSuffix = showAnnotated ? "/annotated" : ""
  const frontUrl = effectiveIp ? `http://${effectiveIp}:8081/stream/front${streamSuffix}` : ""
  const rearUrl = effectiveIp ? `http://${effectiveIp}:8081/stream/rear${streamSuffix}` : ""

  function startRecording() {
    if (!canvasRef.current || !frontImgRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 640
    canvas.height = 480

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
      a.download = `herm-dashcam-${ts}.webm`
      a.click()
      URL.revokeObjectURL(url)
    }

    recorder.start(100)
    setRecording(true)
    setRecordingTime(0)

    // Draw frames from the MJPEG img element onto canvas
    const drawFrame = () => {
      if (!frontImgRef.current || !mediaRecorderRef.current) return
      try {
        ctx.drawImage(frontImgRef.current, 0, 0, canvas.width, canvas.height)
      } catch {
        // CORS or img not loaded
      }
    }
    const frameInterval = setInterval(drawFrame, 1000 / 15)
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)

    // Store the frame interval for cleanup
    ;(recorder as unknown as Record<string, unknown>)._frameInterval = frameInterval
  }

  function stopRecording() {
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current
      const frameInterval = (recorder as unknown as Record<string, unknown>)._frameInterval as ReturnType<typeof setInterval>
      if (frameInterval) clearInterval(frameInterval)
      recorder.stop()
      mediaRecorderRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    setRecordingTime(0)
  }

  function formatRecordingTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0")
    const s = (sec % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  if (!isOnline) {
    return (
      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="gap-2">
          <CardDescription className="flex items-center gap-2">
            <IconCameraOff className="size-4" />
            Camera feed
          </CardDescription>
          <CardTitle>Device offline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Power on your Pi to view the camera feed.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card/92">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <div>
            <CardDescription className="flex items-center gap-2">
              <IconCamera className="size-4" />
              Live camera feed
              {isCameraOnline && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
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
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showAnnotated}
                onChange={(e) => setShowAnnotated(e.target.checked)}
                className="rounded"
              />
              Plate overlays
            </label>
            {connected && (
              recording ? (
                <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1.5">
                  <IconPlayerStop className="size-3.5" />
                  Stop {formatRecordingTime(recordingTime)}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={startRecording} className="gap-1.5">
                  <IconPlayerRecord className="size-3.5 text-red-500" />
                  Record
                </Button>
              )
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {piIp
                ? `Detected Pi at ${piIp} — connecting...`
                : "Enter your Pi's local IP to view the camera. Both devices must be on the same network."}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 192.168.1.42"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (manualIp.trim()) {
                    localStorage.setItem(`herm-pi-ip-${deviceId}`, manualIp.trim())
                    setConnected(true)
                  }
                }}
              >
                Connect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Streaming from <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{effectiveIp}:8081</code>
                {showAnnotated && " (annotated)"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  localStorage.removeItem(`herm-pi-ip-${deviceId}`)
                  setConnected(false)
                  setManualIp("")
                }}
              >
                Disconnect
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-border/70 bg-black">
                <p className="px-3 py-1.5 text-xs font-medium text-white/70">
                  Front
                  {recording && (
                    <span className="ml-2 inline-flex items-center gap-1 text-red-400">
                      <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                      REC
                    </span>
                  )}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={frontImgRef}
                  src={frontUrl}
                  alt="Front camera"
                  className="aspect-video w-full object-cover"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    (e.target as HTMLImageElement).alt = "Camera unreachable — check IP and network"
                  }}
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-border/70 bg-black">
                <p className="px-3 py-1.5 text-xs font-medium text-white/70">Rear</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={rearUrl}
                  alt="Rear camera"
                  className="aspect-video w-full object-cover"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    (e.target as HTMLImageElement).alt = "Camera unreachable"
                  }}
                />
              </div>
            </div>
            {/* Hidden canvas for recording */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
