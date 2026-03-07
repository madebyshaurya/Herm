"use client"

import Link from "next/link"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type WebglHeroButtonProps = {
  href: string
  children: ReactNode
  tone?: "dark" | "light"
  className?: string
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type)

  if (!shader) {
    return null
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader
  }

  gl.deleteShader(shader)
  return null
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  if (!vertexShader || !fragmentShader) {
    return null
  }

  const program = gl.createProgram()

  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return null
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program
  }

  gl.deleteProgram(program)
  return null
}

const vertexSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentSource = `
precision mediump float;

uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_variant;
uniform float u_active;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 centered = uv - 0.5;
  centered.x *= u_resolution.x / u_resolution.y;

  vec2 pointer = u_pointer - 0.5;
  pointer.x *= u_resolution.x / u_resolution.y;

  float waveA = sin(centered.x * 8.0 + u_time * 1.3);
  float waveB = cos(centered.y * 10.0 - u_time * 0.9);
  float wave = 0.5 + 0.5 * (waveA * 0.55 + waveB * 0.45);
  float ring = 1.0 - smoothstep(0.12, 0.92, length(centered + vec2(-0.18, 0.02)));
  float pointerGlow = (1.0 - smoothstep(0.0, 0.75, length(centered - pointer))) * mix(0.2, 1.0, u_active);
  float shimmer = 0.5 + 0.5 * sin((uv.x + uv.y) * 18.0 - u_time * 1.8);

  vec3 darkBase = mix(vec3(0.04, 0.11, 0.16), vec3(0.09, 0.27, 0.36), wave);
  darkBase = mix(darkBase, vec3(0.86, 0.69, 0.38), pointerGlow * 0.32 + ring * 0.12 + shimmer * 0.04);

  vec3 lightBase = mix(vec3(0.96, 0.98, 0.99), vec3(0.77, 0.84, 0.90), wave * 0.7 + ring * 0.18);
  lightBase = mix(lightBase, vec3(1.0, 0.94, 0.79), pointerGlow * 0.18 + shimmer * 0.03);

  vec3 color = mix(darkBase, lightBase, u_variant);
  gl_FragColor = vec4(color, 0.96);
}
`

export function WebglHeroButton({
  href,
  children,
  tone = "dark",
  className,
}: WebglHeroButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLAnchorElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current

    if (!canvas || !host) {
      return
    }

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    })

    if (!gl) {
      return
    }

    const program = createProgram(gl, vertexSource, fragmentSource)

    if (!program) {
      return
    }

    const buffer = gl.createBuffer()

    if (!buffer) {
      gl.deleteProgram(program)
      return
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW
    )

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, "a_position")
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution")
    const pointerLocation = gl.getUniformLocation(program, "u_pointer")
    const timeLocation = gl.getUniformLocation(program, "u_time")
    const variantLocation = gl.getUniformLocation(program, "u_variant")
    const activeLocation = gl.getUniformLocation(program, "u_active")

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const pointer = {
      x: 0.5,
      y: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      active: 0,
    }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const handleMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      pointer.targetX = (event.clientX - rect.left) / rect.width
      pointer.targetY = 1 - (event.clientY - rect.top) / rect.height
      pointer.active = 1
    }

    const handleLeave = () => {
      pointer.targetX = 0.5
      pointer.targetY = 0.5
      pointer.active = 0
    }

    resize()
    setReady(true)

    let frameId = 0
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const render = (now: number) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.08
      pointer.y += (pointer.targetY - pointer.y) * 0.08

      gl.useProgram(program)
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform2f(pointerLocation, pointer.x, pointer.y)
      gl.uniform1f(timeLocation, prefersReducedMotion ? 0 : now * 0.001)
      gl.uniform1f(variantLocation, tone === "light" ? 1 : 0)
      gl.uniform1f(activeLocation, pointer.active)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      if (!prefersReducedMotion) {
        frameId = window.requestAnimationFrame(render)
      }
    }

    host.addEventListener("pointermove", handleMove)
    host.addEventListener("pointerleave", handleLeave)
    window.addEventListener("resize", resize)

    frameId = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("resize", resize)
      host.removeEventListener("pointermove", handleMove)
      host.removeEventListener("pointerleave", handleLeave)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [tone])

  return (
    <Link
      ref={hostRef}
      href={href}
      className={cn(
        "group relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-full border px-5 py-3 text-sm font-medium tracking-[0.02em] shadow-[0_16px_36px_rgba(15,23,42,0.14)] transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        tone === "dark"
          ? "border-slate-900/70 text-white"
          : "border-white/80 text-slate-950 shadow-[0_16px_34px_rgba(15,23,42,0.08)]",
        className
      )}
    >
      <span
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          ready
            ? "opacity-0"
            : tone === "dark"
              ? "bg-[linear-gradient(135deg,#102532_0%,#23485c_52%,#a6844a_100%)]"
              : "bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(225,234,242,0.96))]"
        )}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={cn("absolute inset-0 h-full w-full transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
        aria-hidden="true"
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-[1px] rounded-full",
          tone === "dark"
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_38%,transparent)]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.08)_40%,transparent)]"
        )}
        aria-hidden="true"
      />
      <span className="relative z-10">{children}</span>
    </Link>
  )
}
