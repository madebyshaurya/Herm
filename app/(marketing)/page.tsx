import Link from "next/link"

import { StatusPill } from "@/components/dashboard/status-pill"
import { HermLogo } from "@/components/herm-logo"
import { MarketingHeroBackground } from "@/components/marketing/hero-background"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/lib/auth"
import { formatCoordinate, formatRelativeStatusDate } from "@/lib/format"
import { getMarketingData } from "@/lib/marketing-data"

const surfaces = [
  {
    eyebrow: "Vehicles",
    title: "Report theft, recover faster.",
    copy:
      "Register owned vehicles, open a stolen report, and keep its status current without jumping between tools.",
  },
  {
    eyebrow: "Sightings",
    title: "One calm timeline for detections.",
    copy:
      "Matched and unmatched sightings land with coordinates, timestamps, confidence, and evidence references.",
  },
  {
    eyebrow: "Devices",
    title: "Pair Raspberry Pi modules cleanly.",
    copy:
      "Create a device, generate a setup secret, and watch heartbeats, GPS, and camera health from the portal.",
  },
]

const story = [
  "An owner reports plate ABC123 as stolen.",
  "A nearby Herm module detects the plate and posts coordinates.",
  "The backend matches the sighting against active reports.",
  "The dashboard updates with the event, source module, and evidence.",
]

const evidenceCards = [
  {
    title: "Snapshot evidence",
    body: "Every event can carry a still image reference so the dashboard feels concrete during a demo.",
  },
  {
    title: "Local alerts",
    body: "Human detections from the owner’s own device stay separate from the crowdsourced recovery feed.",
  },
  {
    title: "Status surface",
    body: "Online devices, stale heartbeats, and setup secrets remain visible without turning the product noisy.",
  },
]

function DemoCard({
  title,
  subtitle,
  detail,
}: {
  title: string
  subtitle: string
  detail: string
}) {
  return (
    <Card className="herm-hover-lift h-full rounded-[1.75rem] border-border/60 bg-white text-sm shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
      <CardHeader className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{subtitle}</p>
        <CardTitle className="text-base tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm leading-6">{detail}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-[1.35rem] border border-border/55 bg-background px-4 py-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-20 rounded-full bg-muted" />
              <div className="herm-pulse h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="herm-sweep rounded-xl border border-border/60 bg-white px-3 py-3">
              <div className="space-y-2">
                <div className="h-2 w-16 rounded-full bg-muted" />
                <div className="h-9 rounded-lg border border-border/60 bg-background" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-9 rounded-lg border border-border/60 bg-white" />
              <div className="h-9 rounded-lg border border-border/60 bg-white" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function HomePage() {
  const user = await getOptionalUser()
  const marketing = await getMarketingData()
  const liveFeed = [
    marketing.latestMatch
      ? {
          label: "Latest matched sighting",
          tone: "matched" as const,
          detail: `Recorded ${formatRelativeStatusDate(marketing.latestMatch.detected_at)} at ${formatCoordinate(
            marketing.latestMatch.latitude
          )}, ${formatCoordinate(marketing.latestMatch.longitude)}.`,
          meta: "matched",
        }
      : {
          label: "Latest matched sighting",
          tone: "offline" as const,
          detail: "No matched sightings have been recorded yet.",
          meta: "empty",
        },
    marketing.recentSightingCount != null
      ? {
          label: "Network detections",
          tone: marketing.recentSightingCount > 0 ? ("active" as const) : ("offline" as const),
          detail: `${marketing.recentSightingCount} plate sighting${
            marketing.recentSightingCount === 1 ? "" : "s"
          } logged in the last 24 hours.`,
          meta: "24h",
        }
      : {
          label: "Network detections",
          tone: "offline" as const,
          detail: "Network totals are unavailable until the backend is configured.",
          meta: "setup",
        },
    marketing.latestHeartbeat
      ? {
          label: "Latest module heartbeat",
          tone: marketing.latestHeartbeat.status === "online" ? ("online" as const) : ("offline" as const),
          detail: `Most recent module check-in was ${formatRelativeStatusDate(marketing.latestHeartbeat.last_heartbeat_at)}.`,
          meta: marketing.latestHeartbeat.status,
        }
      : {
          label: "Latest module heartbeat",
          tone: "offline" as const,
          detail: "No device heartbeats have been received yet.",
          meta: "empty",
        },
  ]

  return (
    <main className="pb-28">
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0">
          <MarketingHeroBackground />
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,rgba(255,255,255,0.2),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.28),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.12))]" />

        <div className="relative z-10">
          <div className="page-shell pt-5 sm:pt-7 lg:pt-8">
            <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-white/70 bg-white/92 px-4 py-3 shadow-[0_12px_38px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:flex-nowrap sm:rounded-full sm:px-5">
              <Link className="block w-[126px] text-foreground" href="/" aria-label="Herm home">
                <HermLogo className="w-[126px]" />
              </Link>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button asChild size="sm" variant="ghost">
                  <Link href={user ? "/dashboard" : "/login"}>{user ? "Dashboard" : "Sign in"}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={user ? "/dashboard/devices" : "/login"}>
                    {user ? "Add device" : "Get started"}
                  </Link>
                </Button>
              </div>
            </header>
          </div>

          <div className="page-shell flex min-h-[calc(100svh-96px)] items-center py-10 sm:py-14 lg:min-h-[calc(100svh-108px)] lg:py-16">
            <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_27rem] lg:items-center xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-10">
              <div className="herm-panel-reveal max-w-3xl rounded-[2rem] border border-white/72 bg-white/88 p-5 shadow-[0_30px_100px_rgba(15,23,42,0.06)] backdrop-blur-md sm:p-7 lg:max-w-2xl lg:rounded-[2.4rem] lg:p-9 xl:max-w-3xl" data-delay="0">
                <div className="inline-flex rounded-full border border-white/80 bg-white/88 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Crowdsourced vehicle recovery
                </div>
                <h1 className="display-type mt-5 max-w-2xl text-[2.55rem] leading-[0.95] tracking-tight text-foreground sm:text-[3.35rem] lg:text-[4.35rem] xl:text-[4.75rem]">
                  Vehicle recovery, device health, local alerts.
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  Herm keeps reports, Raspberry Pi modules, and incoming detections in one calm owner portal.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <Link href={user ? "/dashboard" : "/login"}>Open dashboard</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={user ? "/dashboard/devices" : "/login"}>See device setup</Link>
                  </Button>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-border/60 bg-white/80 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Active reports
                    </p>
                    <p className="mt-2 text-lg text-foreground">
                      {marketing.activeReportCount == null ? "—" : marketing.activeReportCount}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-white/80 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Devices online
                    </p>
                    <p className="mt-2 text-lg text-foreground">
                      {marketing.onlineDeviceCount == null ? "—" : marketing.onlineDeviceCount}
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] border border-border/60 bg-white/80 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Detections 24h
                    </p>
                    <p className="mt-2 text-lg text-foreground">
                      {marketing.recentSightingCount == null ? "—" : marketing.recentSightingCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 self-stretch lg:pl-2">
                <Card className="herm-panel-reveal herm-hover-lift rounded-[1.8rem] border-white/72 bg-white/92 text-sm shadow-[0_22px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm" data-delay="1">
                  <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      <span>Portal preview</span>
                      <span>Live</span>
                    </div>
                    <div className="grid gap-3 grid-cols-2">
                      <div className="rounded-[1.35rem] border border-border/60 bg-background px-4 py-5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Active reports
                        </p>
                        <p className="mt-3 text-lg text-foreground">
                          {marketing.activeReportCount == null ? "—" : marketing.activeReportCount}
                        </p>
                      </div>
                      <div className="rounded-[1.35rem] border border-border/60 bg-background px-4 py-5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Devices online
                        </p>
                        <p className="mt-3 text-lg text-foreground">
                          {marketing.onlineDeviceCount == null ? "—" : marketing.onlineDeviceCount}
                        </p>
                      </div>
                    </div>
                    <CardDescription className="text-sm leading-6">
                      Live network totals from the current Herm backend, with empty states instead of mock values.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="herm-panel-reveal herm-hover-lift rounded-[1.8rem] border-white/72 bg-white/92 text-sm shadow-[0_22px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm" data-delay="2">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm tracking-tight">Live feed demo</CardTitle>
                    <CardDescription className="text-sm leading-6">
                      A product-facing version of what owners will actually watch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {liveFeed.map((item, index) => (
                      <div
                        key={item.label}
                        className="herm-hover-lift rounded-[1.2rem] border border-border/60 bg-background px-4 py-5 shadow-sm"
                        style={{ animationDelay: `${index * 180}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[15px] text-foreground">{item.label}</p>
                          <StatusPill tone={item.tone}>{item.meta}</StatusPill>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="herm-panel-reveal rounded-[1.8rem] border border-white/72 bg-white/88 px-5 py-4 text-sm leading-6 text-muted-foreground backdrop-blur-sm" data-delay="3">
                  Herm runs best when the portal and the Raspberry Pi are simple: device auth, heartbeat, sightings, alerts.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-20 sm:py-24 lg:py-28">
        <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <div className="max-w-md space-y-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Product demo
            </p>
            <h2 className="display-type text-3xl leading-tight tracking-tight sm:text-4xl">
              Longer, lighter, and still anchored in the real product.
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The landing page should feel generous. It should explain the system, show enough interface
              detail to feel tangible, and leave plenty of white space around everything.
            </p>
            <pre className="overflow-x-auto rounded-[1.7rem] border border-border/60 bg-white px-5 py-4 text-[11px] leading-5 text-muted-foreground shadow-none">
{` owner ── report plate
   │
   ├─ herm cloud ── match ── notify
   │
 module ── detect plate
   └─ detect person ── owner alert `}
            </pre>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {surfaces.map((surface) => (
              <DemoCard
                key={surface.eyebrow}
                subtitle={surface.eyebrow}
                title={surface.title}
                detail={surface.copy}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="page-shell pb-16 sm:pb-20">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[2rem] border-border/60 bg-white shadow-none">
            <CardHeader className="space-y-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Two systems
              </p>
              <CardTitle className="text-xl tracking-tight">
                The crowdsourced network and the owner’s own module coexist cleanly.
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7">
                One device can help recover a reported vehicle while also keeping watch over its own
                parked car. The dashboard needs to express both without feeling overloaded.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.4rem] border border-border/60 bg-background px-5 py-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Stolen vehicle detection
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Plate sightings arrive from the network and match against active reports, ready for
                  push fanout later.
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-border/60 bg-background px-5 py-5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Local suspicious activity
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Human detections remain tied to the owner’s own device and stay visible as a separate
                  evidence surface.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-border/60 bg-white shadow-none">
            <CardHeader className="space-y-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Flow</p>
              <CardTitle className="text-xl tracking-tight">How the portal behaves.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {story.map((step, index) => (
                <div key={step} className="rounded-[1.4rem] border border-border/55 bg-background px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{step}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="page-shell pb-16 sm:pb-20">
        <div className="rounded-[2.25rem] border border-border/60 bg-white px-6 py-8 shadow-none sm:px-8 sm:py-10">
          <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div className="max-w-md space-y-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Evidence</p>
              <h2 className="display-type text-3xl leading-tight tracking-tight sm:text-4xl">
                Product proof without crowding the page.
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                The rest of the page can stay restrained while still surfacing snapshots, alerts, and
                device state in ways that feel credible during a demo.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {evidenceCards.map((card, index) => (
                <Card
                  key={card.title}
                  className="rounded-[1.7rem] border-border/60 bg-background shadow-none"
                >
                  <CardHeader className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      0{index + 1}
                    </p>
                    <CardTitle className="text-sm tracking-tight">{card.title}</CardTitle>
                    <CardDescription className="text-sm leading-6">{card.body}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="rounded-[1.2rem] border border-border/55 bg-white px-3 py-3">
                      <div className="h-28 rounded-[1rem] border border-border/60 bg-[linear-gradient(135deg,rgba(180,194,221,0.28),rgba(255,255,255,0.95))]" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell">
        <div className="rounded-[2.5rem] border border-border/60 bg-white px-6 py-10 sm:px-8 sm:py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ready</p>
              <h2 className="display-type text-3xl leading-tight tracking-tight sm:text-4xl">
                Start with the dashboard, then connect the hardware.
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                The web portal is already the operational center. The next step is connecting the Pi
                module so the detections and alerts become real.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href={user ? "/dashboard" : "/login"}>Open dashboard</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={user ? "/dashboard/devices" : "/login"}>Pair a module</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
