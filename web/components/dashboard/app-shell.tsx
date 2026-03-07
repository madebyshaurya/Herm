"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconLayoutDashboard,
  IconCar,
  IconRadar,
  IconDevices,
  IconAlertTriangle,
  IconShieldCheck,
} from "@tabler/icons-react"

import { HermLogo } from "@/components/herm-logo"
import { SignOutButton } from "@/components/dashboard/sign-out-button"
import { cn } from "@/lib/utils"

const navigation = [
  { href: "/dashboard", label: "Overview", icon: IconLayoutDashboard, exact: true },
  { href: "/dashboard/vehicles", label: "Vehicles", icon: IconCar },
  { href: "/dashboard/sightings", label: "Sightings", icon: IconRadar },
  { href: "/dashboard/devices", label: "Devices", icon: IconDevices },
  { href: "/dashboard/alerts", label: "Alerts", icon: IconAlertTriangle },
]

export function AppShell({
  email,
  children,
}: {
  email: string | null | undefined
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="page-shell grid gap-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="glass-panel h-fit rounded-2xl p-4 lg:sticky lg:top-6">
        <div className="mb-6">
          <Link className="block w-[108px] text-foreground" href="/" aria-label="Herm home">
            <HermLogo className="w-[108px]" />
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <IconShieldCheck className="h-4 w-4 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Network active
            </p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
                  )}
                  stroke={isActive ? 2 : 1.5}
                />
                {item.label}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="mt-6 border-t border-border/50 pt-4">
          <p className="mb-3 truncate text-xs text-muted-foreground">{email ?? "Signed in"}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  )
}
