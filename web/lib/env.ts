const PUBLIC_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL"
const PUBLIC_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
const PUBLIC_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
const SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY"

function readPublicUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ""
}

function readPublicAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || ""
}

function readPublicPublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || ""
}

function readServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ""
}

export function getSupabaseUrl() {
  const value = readPublicUrl()

  if (!value) {
    throw new Error(`${PUBLIC_URL_KEY} is not configured.`)
  }

  return value
}

export function getSupabaseAnonKey() {
  const value = readPublicAnonKey() || readPublicPublishableKey()

  if (!value) {
    throw new Error(
      `${PUBLIC_ANON_KEY} is not configured. You can also use ${PUBLIC_PUBLISHABLE_KEY}.`
    )
  }

  return value
}

export function getSupabaseServiceRoleKey() {
  const value = readServiceRoleKey()

  if (!value) {
    throw new Error(`${SERVICE_ROLE_KEY} is not configured.`)
  }

  return value
}

export function isSupabaseConfigured() {
  return Boolean(readPublicUrl() && (readPublicAnonKey() || readPublicPublishableKey()))
}

export function isServiceRoleConfigured() {
  return isSupabaseConfigured() && Boolean(readServiceRoleKey())
}
