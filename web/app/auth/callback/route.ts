import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = searchParams.get("next") || "/dashboard"
  const redirectTo = new URL(next, origin)
  const loginUrl = new URL("/login", origin)
  const cookieStore = await cookies()
  let response = NextResponse.redirect(redirectTo)

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      loginUrl.searchParams.set("error", error.message)
      return NextResponse.redirect(loginUrl)
    }

    return response
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "email",
    })

    if (error) {
      loginUrl.searchParams.set("error", error.message)
      return NextResponse.redirect(loginUrl)
    }

    return response
  }

  return NextResponse.redirect(loginUrl)
}
