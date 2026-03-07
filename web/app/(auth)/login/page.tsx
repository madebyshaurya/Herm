import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { SetupRequired } from "@/components/setup-required"
import { getOptionalUser } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/env"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getOptionalUser()

  if (user) {
    redirect("/dashboard")
  }

  if (!isSupabaseConfigured()) {
    return <SetupRequired />
  }

  const params = await searchParams
  const next =
    typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/dashboard"
  const error = typeof params.error === "string" ? params.error : null

  return (
    <div className="page-shell flex min-h-[78vh] items-center justify-center py-16">
      <div className="space-y-4">
        <LoginForm next={next} />
        {error ? <p className="max-w-md text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
