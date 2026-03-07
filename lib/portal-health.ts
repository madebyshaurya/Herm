import { cache } from "react"

import { isServiceRoleConfigured } from "@/lib/env"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"])

export const getPortalHealth = cache(async () => {
  if (!isServiceRoleConfigured()) {
    return {
      ready: false,
      reason: "missing_env" as const,
    }
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from("devices").select("id").limit(1)

  if (!error) {
    return {
      ready: true,
      reason: null,
    }
  }

  if (error.code && MISSING_RELATION_CODES.has(error.code)) {
    return {
      ready: false,
      reason: "missing_schema" as const,
    }
  }

  return {
    ready: false,
    reason: "unavailable" as const,
  }
})
