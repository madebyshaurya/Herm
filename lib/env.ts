const PUBLIC_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL"
const PUBLIC_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
const PUBLIC_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
const SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY"

function readEnv(key: string) {
  return process.env[key]?.trim() || ""
}

export function getSupabaseUrl() {
  const value = readEnv(PUBLIC_URL_KEY)

  if (!value) {
    throw new Error(`${PUBLIC_URL_KEY} is not configured.`)
  }

  return value
}

export function getSupabaseAnonKey() {
  const value = readEnv(PUBLIC_ANON_KEY) || readEnv(PUBLIC_PUBLISHABLE_KEY)

  if (!value) {
    throw new Error(
      `${PUBLIC_ANON_KEY} is not configured. You can also use ${PUBLIC_PUBLISHABLE_KEY}.`
    )
  }

  return value
}

export function getSupabaseServiceRoleKey() {
  const value = readEnv(SERVICE_ROLE_KEY)

  if (!value) {
    throw new Error(`${SERVICE_ROLE_KEY} is not configured.`)
  }

  return value
}

export function isSupabaseConfigured() {
  return Boolean(readEnv(PUBLIC_URL_KEY) && (readEnv(PUBLIC_ANON_KEY) || readEnv(PUBLIC_PUBLISHABLE_KEY)))
}

export function isServiceRoleConfigured() {
  return isSupabaseConfigured() && Boolean(readEnv(SERVICE_ROLE_KEY))
}
