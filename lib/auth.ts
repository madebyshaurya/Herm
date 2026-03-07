import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/env"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function getOptionalUser() {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function requireUser() {
  const user = await getOptionalUser()

  if (!user) {
    redirect("/login")
  }

  return user
}
