"use client"

import { createBrowserClient } from "@supabase/ssr"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env"

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createBrowserSupabaseClient() {
  if (browserClient) {
    return browserClient
  }

  browserClient = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey())

  return browserClient
}
