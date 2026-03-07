"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

function getSafeNext(next: string | null) {
  return next && next.startsWith("/") ? next : "/dashboard"
}

function readHashParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams()
  }

  const value = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash

  return new URLSearchParams(value)
}

export function AuthSessionBridge() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    const hashParams = readHashParams()
    const accessToken = hashParams.get("access_token") ?? searchParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token") ?? searchParams.get("refresh_token")
    const authError =
      searchParams.get("error_description") ??
      hashParams.get("error_description") ??
      searchParams.get("error") ??
      hashParams.get("error")
    const hasAuthReturn =
      searchParams.has("code") ||
      searchParams.has("token_hash") ||
      Boolean(accessToken) ||
      Boolean(refreshToken) ||
      hashParams.has("access_token") ||
      hashParams.has("refresh_token") ||
      Boolean(authError)
    const next = getSafeNext(searchParams.get("next"))

    if (authError && pathname !== "/login") {
      const loginUrl = new URL("/login", window.location.origin)
      loginUrl.searchParams.set("error", authError)
      loginUrl.searchParams.set("next", next)
      router.replace(`${loginUrl.pathname}${loginUrl.search}`)
      return
    }

    void (async () => {
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          const loginUrl = new URL("/login", window.location.origin)
          loginUrl.searchParams.set("error", error.message)
          loginUrl.searchParams.set("next", next)
          router.replace(`${loginUrl.pathname}${loginUrl.search}`)
          return
        }

        if (data.session && (pathname === "/login" || hasAuthReturn)) {
          router.replace(next)
          router.refresh()
        }

        return
      }

      const { data } = (await supabase.auth.getSession()) as {
        data: { session: Session | null }
      }

      if (data.session && (pathname === "/login" || hasAuthReturn)) {
        router.replace(next)
        router.refresh()
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_IN" && session && (pathname === "/login" || hasAuthReturn)) {
        router.replace(next)
        router.refresh()
      }

      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [pathname, router, searchParams])

  return null
}
