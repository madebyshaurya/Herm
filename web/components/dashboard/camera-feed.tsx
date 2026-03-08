"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconCamera,
  IconCameraOff,
  IconPlayerRecord,
  IconPlayerStop,
  IconRefresh,
  IconSwitchHorizontal,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type CameraInfo = {
  role: string
  name: string
  running: boolean
  frameCount: number
  lastFrameTime: number
  resolution: string
  type: string
  device: string | number | null
}

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
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [loadingCameras, setLoadingCameras] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingRole, setRecordingRole] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [showAnnotated, setShowAnnotated] = useState(true)
  const [assigningRole, setAssigningRole] = useState<string | null>(null)
  const [newRole, setNewRole] = useState("")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeImgRef = useRef<HTMLImageElement>(null)
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

  useEffect(() => {
    if (piIp && !connected) {
      setConnected(true)
    }
  }, [piIp, connected])

  const fetchCameras = useCallback(async () => {
    if (!effectiveIp) return
    setLoadingCameras(true)
    try {
      const res = await fetch(`http://${effectiveIp}:8081/cameras`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        const cams: CameraInfo[] = Object.values(data.cameras || {})
        setCameras(cams)
      }
    } catch {
      // Camera service may be unreachable
    } finally {
      setLoadingCameras(false)
    }
  }, [effectiveIp])

  // Fetch cameras on connect
  useEffect(() => {
    if (connected && effectiveIp) {
      fetchCameras()
    }
  }, [connected, effectiveIp, fetchCameras])

  // Auto-refresh camera list every 5s
  useEffect(() => {
    if (!connected || !effectiveIp) return
    const timer = setInterval(fetchCameras, 5000)
    return () => clearInterval(timer)
  }, [connected, effectiveIp, fetchCameras])

  function streamUrl(role: string) {
    const suffix = showAnnotated ? "/annotated" : ""
    return effectiveIp ? `http://${effectiveIp}:8081/stream/${encodeURIComponent(role)}${suffix}` : ""
  }

  async function assignRole(fromRole: string, toRole: string) {
    if (!effectiveIp || !toRole.trim()) return
    try {
      const res = await fetch(`http://${effectiveIp}:8081/cameras/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromRole, to: toRole.trim() }),
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        await fetchCameras()
      }
    } catch {
      // ignore
    }
    setAssigningRole(null)
    setNewRole("")
  }

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
      } catch {
        // CORS or img not loaded
      }
    }
    const frameInterval = setInterval(drawFrame, 1000 / 15)
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
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
    setRecordingRole(null)
    setRecordingTime(0)
  }

  function formatRecordingTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0")
    const s = (sec % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  const roleLabels: Record<string, string> = { front: "Front", rear: "Rear" }

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardDescription className="flex items-center gap-2">
              <IconCamera className="size-4" />
              Live camera feed
              {isCameraOnline && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {cameras.length} camera{cameras.length !== 1 ? "s" : ""}
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
              <Button size="sm" variant="outline" onClick={fetchCameras} disabled={loadingCameras} className="gap-1.5">
                <IconRefresh className={`size-3.5 ${loadingCameras ? "animate-spin" : ""}`} />
                Refresh
              </Button>
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
                  setCameras([])
                }}
              >
                Disconnect
              </Button>
            </div>

            {cameras.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
                <IconCameraOff className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {loadingCameras
                    ? "Detecting cameras..."
                    : "No cameras detected. Check USB connections or run: sudo herm-diag cameras"}
                </p>
              </div>
            ) : (
              <div className={`grid gap-3 ${cameras.length === 1 ? "" : "sm:grid-cols-2"}`}>
                {cameras.map((cam) => (
                  <div key={cam.role} className="overflow-hidden rounded-xl border border-border/70 bg-black">
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-white/70">
                          {roleLabels[cam.role] || cam.role}
                        </p>
                        <span className="text-[10px] text-white/40">{cam.name}</span>
                        {recording && recordingRole === cam.role && (
                          <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                            REC {formatRecordingTime(recordingTime)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {assigningRole === cam.role ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={newRole}
                              onChange={(e) => setNewRole(e.target.value)}
                              className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white border border-white/20"
                            >
                              <option value="">Assign...</option>
                              <option value="front">Front</option>
                              <option value="rear">Rear</option>
                              <option value="interior">Interior</option>
                              <option value="side-left">Side Left</option>
                              <option value="side-right">Side Right</option>
                            </select>
                            <button
                              onClick={() => assignRole(cam.role, newRole)}
                              className="rounded bg-emerald-500/80 px-1.5 py-0.5 text-xs text-white hover:bg-emerald-500"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => { setAssigningRole(null); setNewRole("") }}
                              className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/70 hover:bg-white/20"
                            >
                              ✗
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAssigningRole(cam.role)}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/20 hover:text-white flex items-center gap-1"
                            title="Assign role (front/rear)"
                          >
                            <IconSwitchHorizontal className="size-3" />
                            Assign
                          </button>
                        )}
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
                      {cam.running ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={streamUrl(cam.role)}
                          alt={`${cam.role} camera`}
                          className="aspect-video w-full object-cover"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none"
                            const parent = (e.target as HTMLElement).parentElement
                            if (parent && !parent.querySelector(".cam-error")) {
                              const msg = document.createElement("div")
                              msg.className = "cam-error aspect-video flex items-center justify-center text-white/40 text-sm"
                              msg.textContent = "Stream unreachable"
                              parent.appendChild(msg)
                            }
                          }}
                        />
                      ) : (
                        <div className="aspect-video flex items-center justify-center text-white/40 text-sm">
                          Camera stopped
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-1 bg-white/5 flex items-center justify-between text-[10px] text-white/40">
                      <span>{cam.type}</span>
                      <span>{cam.resolution}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
