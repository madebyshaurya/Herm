"use client"

import dynamic from "next/dynamic"

const UnicornHeroScene = dynamic(
  () =>
    import("@/components/marketing/unicorn-hero-scene").then((module) => module.UnicornHeroScene),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full bg-[radial-gradient(circle_at_18%_18%,rgba(168,190,232,0.55),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(188,217,255,0.48),transparent_32%),linear-gradient(180deg,#eaf1fb_0%,#f5f7fc_100%)]"
        aria-hidden="true"
      />
    ),
  }
)

export function MarketingHeroBackground() {
  return <UnicornHeroScene />
}
