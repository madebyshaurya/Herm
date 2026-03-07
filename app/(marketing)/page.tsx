import Link from "next/link"

import { StatusPill } from "@/components/dashboard/status-pill"
import { HermLogo } from "@/components/herm-logo"
import { MarketingHeroBackground } from "@/components/marketing/hero-background"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/lib/auth"

const liveFeed = [
  {
    label: "Matched sighting",
    tone: "matched" as const,
    detail: "Plate ABC123 matched an active report near Richmond Hill.",
    meta: "03:14 PM",
  },
  {
    label: "Module online",
    tone: "online" as const,
    detail: "Driveway module checked in with camera and GPS health.",
    meta: "2 min ago",
  },
  {
    label: "Human detection",
    tone: "active" as const,
    detail: "A local activity event was stored with a snapshot attachment.",
    meta: "1 min ago",
  },
]

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
    <Card className="h-full rounded-[1.75rem] border-border/60 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]">
      <CardHeader className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{subtitle}</p>
        <CardTitle className="text-sm tracking-tight">{title}</CardTitle>
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

  return (
    <main className="pb-28">
      <section className="relative min-h-[122svh] overflow-hidden border-b border-border/60">
        <div className="absolute inset-0">
          <MarketingHeroBackground />
        </div>

        <div className="absolute inset-0 bg-white/8" />

        <div className="relative z-10">
          <div className="page-shell py-8">
            <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/92 px-4 py-3 shadow-[0_12px_38px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:px-5">
              <Link className="block w-[126px] text-foreground" href="/" aria-label="Herm home">
                <HermLogo className="w-[126px]" />
              </Link>
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost">
                  <Link href={user ? "/dashboard" : "/login"}>{user ? "Dashboard" : "Sign in"}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={user ? "/dashboard/devices" : "/login"}>
                    {user ? "Add device" : "Get started"}
                  </Link>
                </Button>
              </div>
            </header>
          </div>

          <div className="page-shell flex min-h-[calc(122svh-96px)] items-end pb-16 pt-12 sm:pb-20 lg:pb-24">
            <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
              <div className="max-w-3xl rounded-[2.5rem] border border-white/70 bg-white/88 p-6 shadow-[0_30px_100px_rgba(15,23,42,0.06)] backdrop-blur-md sm:p-8 lg:p-10">
                <div className="inline-flex rounded-full border border-white/80 bg-white/88 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Crowdsourced vehicle recovery
                </div>
                <h1 className="display-type mt-6 max-w-2xl text-[2.7rem] leading-[0.96] tracking-tight text-foreground sm:text-[3.8rem] lg:text-[5.2rem]">
                  One portal for stolen vehicle sightings, device health, and local alerts.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  Herm keeps the core product simple: register vehicles, report theft, monitor Raspberry
                  Pi modules, and review incoming sightings without the dashboard turning loud.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <Link href={user ? "/dashboard" : "/login"}>Open dashboard</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={user ? "/dashboard/devices" : "/login"}>See device setup</Link>
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <Card className="herm-float rounded-[2rem] border-white/72 bg-white/92 shadow-[0_22px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                  <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      <span>Portal preview</span>
                      <span>Live</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.35rem] border border-border/60 bg-background px-4 py-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Active reports
                        </p>
                        <p className="mt-3 text-lg text-foreground">02</p>
                      </div>
                      <div className="rounded-[1.35rem] border border-border/60 bg-background px-4 py-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Devices online
                        </p>
                        <p className="mt-3 text-lg text-foreground">03</p>
                      </div>
                    </div>
                    <CardDescription className="text-sm leading-6">
                      A working portal preview with active reports, module health, and recent feed activity.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="rounded-[2rem] border-white/72 bg-white/92 shadow-[0_22px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
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
                        className="herm-rise rounded-[1.35rem] border border-border/60 bg-background px-4 py-4 shadow-sm"
                        style={{ animationDelay: `${index * 180}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-foreground">{item.label}</p>
                          <StatusPill tone={item.tone}>{item.meta}</StatusPill>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell py-28">
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="max-w-md space-y-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Product demo
            </p>
            <h2 className="display-type text-3xl leading-tight tracking-tight sm:text-4xl">
              Longer, lighter, and still anchored in the real product.
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The landing page should feel generous. It should explain the system, show enough fake
              interface to feel tangible, and leave plenty of white space around everything.
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

          <div className="grid gap-5 lg:grid-cols-3">
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

      <section className="page-shell pb-20">
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

      <section className="page-shell pb-20">
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
