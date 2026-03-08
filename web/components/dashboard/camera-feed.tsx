"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconCamera,
  IconCameraOff,
  IconPlayerRecord,
  IconPlayerStop,
  IconRefresh,
  IconWifi,
  IconCloud,
  IconNetwork,
  IconSettings,
  IconCheck,
  IconX,
} from "@tabler/icons-react"

import { createBrowserSupabaseClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"

type CameraFrame = {
  role: string
  name: string | null
  frame: string | null
}

type StreamMode = "direct" | "cloud" | "probing"

function getStorageKey(deviceId: string) {
  return `herm-direct-ip-${deviceId}`
}

function isTailscaleIp(ip: string) {
  return ip.startsWith("100.")
}

function getStreamLabel(url: string | null) {
  if (!url) return "Direct"
  const ip = url.replace("http://", "").split(":")[0]
  return isTailscaleIp(ip) ? "Tailscale" : "LAN"
}

export function CameraFeed({
  deviceId,
  isOnline,
  isCameraOnline,
  piAddress,
}: {
  deviceId: string
  isOnline: boolean
  isCameraOnline: boolean
  piAddress?: string | null
}) {
  const [cameras, setCameras] = useState<CameraFrame[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingRole, setRecordingRole] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [streamMode, setStreamMode] = useState<StreamMode>("probing")
  const [directUrl, setDirectUrl] = useState<string | null>(null)
  const [showStreamSettings, setShowStreamSettings] = useState(false)
  const [customIp, setCustomIp] = useState("")
  const [customIpStatus, setCustomIpStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeImgRef = useRef<HTMLImageElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latestFrameRef = useRef<Map<string, CameraFrame>>(new Map())

  // Load saved custom IP from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(deviceId))
      if (saved) setCustomIp(saved)
    } catch { /* ignore */ }
  }, [deviceId])

  // Probe direct MJPEG stream — tries custom IP first, then all telemetry IPs
  useEffect(() => {
    // Collect all candidate IPs: custom (from localStorage) first, then telemetry
    const telemetryIps = piAddress ? piAddress.split(",").map((ip) => ip.trim()).filter(Boolean) : []
    let savedIp: string | null = null
    try { savedIp = localStorage.getItem(getStorageKey(deviceId)) } catch { /* ignore */ }
    const allIps = savedIp
      ? [savedIp, ...telemetryIps.filter((ip) => ip !== savedIp)]
      : telemetryIps

    if (allIps.length === 0 || !isOnline) {
      setStreamMode("cloud")
      setDirectUrl(null)
      return
    }

    setStreamMode("probing")
    let found = false
    let pending = allIps.length
    const timeoutId = setTimeout(() => {
      if (!found) {
        setStreamMode("cloud")
        setDirectUrl(null)
      }
    }, 4000)

    const probes = allIps.map((ip) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        if (!found) {
          found = true
          clearTimeout(timeoutId)
          setDirectUrl(`http://${ip}:8082/stream`)
          setStreamMode("direct")
        }
      }
      img.onerror = () => {
        pending--
        if (pending === 0 && !found) {
          clearTimeout(timeoutId)
          setStreamMode("cloud")
          setDirectUrl(null)
        }
      }
      img.src = `http://${ip}:8082/stream`
      return img
    })

    return () => {
      clearTimeout(timeoutId)
      probes.forEach((img) => { img.src = "" })
    }
  }, [piAddress, isOnline, deviceId])

  // HTTP polling — fallback when direct stream isn't available
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

  // Only poll cloud when not using direct stream and Realtime isn't active
  useEffect(() => {
    if (!isOnline || streamMode === "direct") return
    setLoading(true)
    fetchCameras()
    // Poll less frequently — Realtime handles the fast updates
    const timer = setInterval(() => {
      if (!realtimeActiveRef.current) fetchCameras()
    }, 2000)
    return () => clearInterval(timer)
  }, [isOnline, fetchCameras, streamMode])

  // Supabase Realtime for live streaming when in cloud mode
  const realtimeFpsRef = useRef({ count: 0, lastReset: Date.now(), fps: 0 })
  const realtimeActiveRef = useRef(false)

  useEffect(() => {
    if (!isOnline || !deviceId || streamMode === "direct") return
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
        realtimeActiveRef.current = true
        // Track FPS
        const fpsData = realtimeFpsRef.current
        fpsData.count++
        const now = Date.now()
        if (now - fpsData.lastReset >= 1000) {
          fpsData.fps = fpsData.count
          fpsData.count = 0
          fpsData.lastReset = now
        }
        latestFrameRef.current.set(role, { role, name: camera_name, frame })
        setCameras(Array.from(latestFrameRef.current.values()))
      })
      channel.subscribe()
    } catch {
      // Realtime not available — HTTP polling handles it
    }

    return () => {
      realtimeActiveRef.current = false
      if (channel) {
        try {
          const supabase = createBrowserSupabaseClient()
          channel.unsubscribe()
          supabase.removeChannel(channel)
        } catch {}
      }
    }
  }, [isOnline, deviceId, streamMode])

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

  function saveCustomIp(ip: string) {
    const trimmed = ip.trim()
    try {
      if (trimmed) {
        localStorage.setItem(getStorageKey(deviceId), trimmed)
      } else {
        localStorage.removeItem(getStorageKey(deviceId))
      }
    } catch { /* ignore */ }
    setCustomIp(trimmed)
  }

  function testCustomIp() {
    const ip = customIp.trim()
    if (!ip) return
    setCustomIpStatus("testing")
    const img = new Image()
    img.crossOrigin = "anonymous"
    const timeout = setTimeout(() => { img.src = ""; setCustomIpStatus("fail") }, 4000)
    img.onload = () => {
      clearTimeout(timeout)
      setCustomIpStatus("ok")
      saveCustomIp(ip)
      setDirectUrl(`http://${ip}:8082/stream`)
      setStreamMode("direct")
    }
    img.onerror = () => { clearTimeout(timeout); setCustomIpStatus("fail") }
    img.src = `http://${ip}:8082/stream`
  }

  const streamSettingsRow = (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Direct stream IP</p>
        {piAddress && (
          <p className="text-[10px] text-muted-foreground">
            Auto-detected: {piAddress.split(",").map((ip) => ip.trim()).join(", ")}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="e.g. 100.86.128.22 (Tailscale IP)"
          value={customIp}
          onChange={(e) => { setCustomIp(e.target.value); setCustomIpStatus("idle") }}
          onKeyDown={(e) => { if (e.key === "Enter") testCustomIp() }}
          className="flex-1 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={testCustomIp}
          disabled={!customIp.trim() || customIpStatus === "testing"}
          className="gap-1 shrink-0"
        >
          {customIpStatus === "testing" ? (
            <IconRefresh className="size-3 animate-spin" />
          ) : customIpStatus === "ok" ? (
            <IconCheck className="size-3 text-emerald-500" />
          ) : customIpStatus === "fail" ? (
            <IconX className="size-3 text-red-500" />
          ) : (
            <IconNetwork className="size-3" />
          )}
          {customIpStatus === "testing" ? "Testing..." : customIpStatus === "ok" ? "Connected" : customIpStatus === "fail" ? "Failed" : "Connect"}
        </Button>
        {customIp && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { saveCustomIp(""); setCustomIpStatus("idle") }}
            className="shrink-0 px-2"
          >
            <IconX className="size-3" />
          </Button>
        )}
      </div>
      {customIpStatus === "fail" && (
        <p className="text-[10px] text-red-500">
          Could not reach {customIp.trim()}:8082 — make sure the Pi is running and reachable (Tailscale connected?)
        </p>
      )}
    </div>
  )

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

  // Direct MJPEG stream mode — true 12+ fps
  if (streamMode === "direct" && directUrl) {
    return (
      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardDescription className="flex items-center gap-2">
                <IconCamera className="size-4" />
                Live camera feed
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  {isTailscaleIp(directUrl?.replace("http://", "").split(":")[0] ?? "")
                    ? <IconNetwork className="size-3" />
                    : <IconWifi className="size-3" />}
                  Direct · {getStreamLabel(directUrl)}
                </span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowStreamSettings((v) => !v)}
                className="gap-1 px-2"
              >
                <IconSettings className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setStreamMode("cloud"); setDirectUrl(null) }}
                className="gap-1.5"
              >
                <IconCloud className="size-3.5" />
                Switch to cloud
              </Button>
            </div>
          </div>
          {showStreamSettings && streamSettingsRow}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-black">
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-white/70">front</p>
                <span className="text-[10px] text-emerald-400">~12 fps via {directUrl?.replace("http://", "").replace("/stream", "") ?? "direct"}</span>
                {recording && recordingRole === "front" && (
                  <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                    <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                    REC {formatTime(recordingTime)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {recording && recordingRole === "front" ? (
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
                      if (img) startRecording("front", img)
                    }}
                    className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/60 hover:bg-white/20 hover:text-white flex items-center gap-1"
                  >
                    <IconPlayerRecord className="size-3 text-red-400" />
                    Rec
                  </button>
                ) : null}
              </div>
            </div>
            <div data-cam-role="front">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={directUrl}
                alt="Direct MJPEG stream from Pi"
                className="aspect-video w-full object-cover"
                onError={() => {
                  // MJPEG stream broke — fall back to cloud
                  setStreamMode("cloud")
                  setDirectUrl(null)
                }}
              />
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>
    )
  }

  // Cloud polling mode (fallback)
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
              {streamMode === "probing" && (
                <span className="flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600">
                  <span className="size-1.5 rounded-full bg-sky-500 animate-pulse" />
                  Checking LAN...
                </span>
              )}
              {streamMode === "cloud" && activeCameras.length > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-500">
                  <IconCloud className="size-3" />
                  {realtimeActiveRef.current
                    ? `Live · ${realtimeFpsRef.current.fps || "~"}fps`
                    : "Cloud · ~1 fps"}
                </span>
              )}
              {isCameraOnline && activeCameras.length === 0 && streamMode !== "probing" && (
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
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowStreamSettings((v) => !v)}
              className="gap-1 px-2"
            >
              <IconSettings className="size-3.5" />
            </Button>
            {piAddress && streamMode === "cloud" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const firstIp = piAddress.split(",")[0]?.trim()
                  if (firstIp) {
                    setStreamMode("direct")
                    setDirectUrl(`http://${firstIp}:8082/stream`)
                  }
                }}
                className="gap-1.5"
              >
                <IconWifi className="size-3.5" />
                Try Direct
              </Button>
            )}
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
        </div>
        {showStreamSettings && streamSettingsRow}
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
        {/* Tailscale setup guide — shown in cloud mode to encourage direct streaming */}
        {streamMode === "cloud" && !showStreamSettings && (
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <IconNetwork className="size-4 text-indigo-500" />
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
                Get 12fps direct streaming with Tailscale
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cloud streaming is limited to ~7fps. Connect via Tailscale for full 12fps direct streaming from any network.
            </p>
            <div className="space-y-2 rounded-lg bg-black/5 dark:bg-white/5 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Quick setup</p>
              <div className="space-y-1.5 text-xs text-muted-foreground font-mono">
                <p>1. Pi: <span className="text-foreground select-all">curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up</span></p>
                <p>2. Get Pi IP: <span className="text-foreground select-all">tailscale ip -4</span></p>
                <p>3. Your device: Install <a href="https://tailscale.com/download" target="_blank" rel="noopener" className="text-indigo-500 underline">Tailscale</a> and log in with same account</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowStreamSettings(true)}
              className="gap-1.5"
            >
              <IconSettings className="size-3.5" />
              Enter Tailscale IP
            </Button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  )
}
