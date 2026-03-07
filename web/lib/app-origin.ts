import { headers } from "next/headers"
import { getDeviceApiBaseUrl } from "@/lib/env"

export async function getAppOrigin() {
  const configuredOrigin = getDeviceApiBaseUrl()

  if (configuredOrigin) {
    return configuredOrigin
  }

  const requestHeaders = await headers()
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")

  if (!host) {
    return "http://localhost:3000"
  }

  return `${protocol}://${host}`
}
