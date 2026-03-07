import { AppShell } from "@/components/dashboard/app-shell"
import { LiveRefresh } from "@/components/dashboard/live-refresh"
import { SetupRequired } from "@/components/setup-required"
import { requireUser } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/env"
import { getPortalHealth } from "@/lib/portal-health"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  if (!isSupabaseConfigured()) {
    return <SetupRequired />
  }

  const portalHealth = await getPortalHealth()

  if (!portalHealth.ready) {
    return <SetupRequired mode={portalHealth.reason ?? "unavailable"} />
  }

  const user = await requireUser()

  return (
    <>
      <LiveRefresh />
      <AppShell email={user.email}>{children}</AppShell>
    </>
  )
}
