import Link from "next/link"

import { HermLogo } from "@/components/herm-logo"
import { SignOutButton } from "@/components/dashboard/sign-out-button"

const navigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/vehicles", label: "Vehicles" },
  { href: "/dashboard/sightings", label: "Sightings" },
  { href: "/dashboard/devices", label: "Devices" },
  { href: "/dashboard/alerts", label: "Alerts" },
]

export function AppShell({
  email,
  children,
}: {
  email: string | null | undefined
  children: React.ReactNode
}) {
  return (
    <div className="page-shell grid gap-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-border/70 bg-card/80 p-4 lg:sticky lg:top-6">
        <div className="mb-6">
          <Link className="block w-[108px] text-foreground" href="/" aria-label="Herm home">
            <HermLogo className="w-[108px]" />
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor devices, reports, and detections.
          </p>
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
          <p className="mb-3 truncate">{email ?? "Signed in"}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  )
}
