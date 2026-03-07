"use client"

import { useState } from "react"

import UnicornScene from "unicornstudio-react/next"

export function UnicornHeroScene() {
  const [sceneState] = useState<"ready" | "fallback">(() => {
    try {
      const canvas = document.createElement("canvas")
      const context =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl")

      return context ? "ready" : "fallback"
    } catch {
      return "fallback"
    }
  })

  if (sceneState === "fallback") {
    return (
      <div
        className="h-full w-full bg-[radial-gradient(circle_at_18%_18%,rgba(168,190,232,0.55),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(188,217,255,0.48),transparent_32%),linear-gradient(180deg,#eaf1fb_0%,#f5f7fc_100%)]"
        aria-hidden="true"
      />
    )
  }

  return (
    <UnicornScene
      projectId="IgcacjIvMZOBXPNR4VGV"
      width="100%"
      height="100%"
      scale={1}
      dpi={1.5}
      sdkUrl="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@2.1.3/dist/unicornStudio.umd.js"
      className="h-full w-full"
      production
      lazyLoad
      ariaLabel="Herm hero background"
      altText="Soft animated background for the Herm landing page"
    />
  )
}
