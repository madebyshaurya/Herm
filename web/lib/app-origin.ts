import { headers } from "next/headers"

export async function getAppOrigin() {
  const requestHeaders = await headers()
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")

  if (!host) {
    return "http://localhost:3000"
  }

  return `${protocol}://${host}`
}
