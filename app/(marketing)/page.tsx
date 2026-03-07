import Link from "next/link"

import { AnimatedList } from "@/components/ui/animated-list"
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid"
import { BlurFade } from "@/components/ui/blur-fade"
import { GridPattern } from "@/components/ui/grid-pattern"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOptionalUser } from "@/lib/auth"

const features = [
  {
    title: "Report a stolen vehicle",
    body: "Register your car, flag it as stolen, and keep every new sighting in one timeline.",
  },
  {
    title: "Crowdsourced detections",
    body: "Nearby modules submit license-plate sightings that can match against active stolen reports.",
  },
  {
    title: "Local suspicious activity alerts",
    body: "Your own Raspberry Pi can log human-detection events around your parked vehicle.",
  },
]

const stats = [
  { value: 24, suffix: "/7", label: "dashboard visibility" },
  { value: 3, suffix: " views", label: "core operator surfaces" },
  { value: 1, suffix: " portal", label: "for modules and recovery" },
]

const alertPreview = [
  "Plate ABC 123 matched an active report near Richmond Hill.",
  "Driveway module came online and posted fresh GPS coordinates.",
  "Suspicious activity alert recorded with a snapshot attachment.",
]

export default async function HomePage() {
  const user = await getOptionalUser()

  return (
    <main>
      <section className="page-shell py-8">
        <header className="flex items-center justify-between border-b border-border/80 py-4">
          <Link className="display-type text-3xl tracking-tight" href="/">
            Herm
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost">
              <Link href={user ? "/dashboard" : "/login"}>{user ? "Dashboard" : "Sign in"}</Link>
            </Button>
            <Button asChild>
              <Link href={user ? "/dashboard/devices" : "/login"}>
                {user ? "Add device" : "Get started"}
              </Link>
            </Button>
          </div>
        </header>
      </section>

      <section className="page-shell py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-8">
            <BlurFade inView className="space-y-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Crowdsourced vehicle recovery
              </p>
              <div className="space-y-4">
                <h1 className="display-type max-w-3xl text-5xl tracking-tight sm:text-6xl lg:text-7xl">
                  A clean command center for stolen vehicle alerts and Raspberry Pi modules.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Herm combines local suspicious-activity detection with a network of modules that
                  can spot reported plates and surface sightings in real time.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href={user ? "/dashboard" : "/login"}>Open dashboard</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={user ? "/dashboard/devices" : "/login"}>Pair your first module</Link>
                </Button>
              </div>
            </BlurFade>

            <BlurFade delay={0.1} inView className="grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm"
                >
                  <p className="text-3xl font-semibold tracking-tight">
                    <NumberTicker className="text-foreground" value={stat.value} />
                    <span>{stat.suffix}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </BlurFade>
          </div>

          <BlurFade delay={0.15} inView>
            <Card className="relative overflow-hidden border-border/80 bg-card/80">
              <GridPattern
                className="opacity-20 [mask-image:linear-gradient(to_bottom,white,transparent)]"
                height={36}
                width={36}
                x={-1}
                y={-1}
              />
              <CardHeader className="relative">
                <CardTitle>Live command center</CardTitle>
                <CardDescription>
                  Vehicles, sightings, and module health are all managed from one dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative grid gap-4">
                <div className="rounded-lg border border-border/70 bg-background/75 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Activity preview
                  </p>
                  <AnimatedList className="mt-4 items-stretch" delay={1400}>
                    {alertPreview.map((item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-border/70 bg-card/85 p-3 text-sm text-foreground shadow-sm"
                      >
                        {item}
                      </div>
                    ))}
                  </AnimatedList>
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        </div>
      </section>

      <section className="page-shell pb-20">
        <BlurFade inView className="mb-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Core flows
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Functionality first, calm interface second.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              The portal is built around real device setup, vehicle reporting, sightings, and
              alerts. Motion is kept to the edges.
            </p>
          </div>
        </BlurFade>

        <BentoGrid className="max-w-none">
          {features.map((feature, index) => (
            <BentoGridItem
              key={feature.title}
              className={index === 0 ? "md:col-span-2 border-border/70 bg-card/85" : "border-border/70 bg-card/85"}
              description={feature.body}
              title={feature.title}
              header={
                <div className="rounded-lg border border-border/70 bg-background/60 p-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Herm v1
                </div>
              }
            />
          ))}
        </BentoGrid>
      </section>
    </main>
  )
}
