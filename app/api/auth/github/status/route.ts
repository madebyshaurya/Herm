import { NextResponse } from "next/server"

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/env"

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ enabled: false, error: "Supabase is not configured." })
  }

  const authorizeUrl = new URL("/auth/v1/authorize", getSupabaseUrl())
  const origin = new URL(request.url).origin
  authorizeUrl.searchParams.set("provider", "github")
  authorizeUrl.searchParams.set("redirect_to", `${origin}/auth/callback`)
  authorizeUrl.searchParams.set("skip_http_redirect", "true")

  const anonKey = getSupabaseAnonKey()
  const response = await fetch(authorizeUrl, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
    redirect: "manual",
  })

  if (response.ok || response.status === 302) {
    return NextResponse.json({ enabled: true })
  }

  let errorMessage = "GitHub sign-in is not enabled."

  try {
    const payload = (await response.json()) as { msg?: string }
    if (payload.msg) {
      errorMessage = payload.msg
    }
  } catch {
    // Ignore JSON parsing errors and use the default message.
  }

  return NextResponse.json({ enabled: false, error: errorMessage })
}
