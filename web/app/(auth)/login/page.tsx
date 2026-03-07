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

  return (
    <div className="page-shell flex min-h-[78vh] items-center justify-center py-16">
      <LoginForm next={next} />
    </div>
  )
}
