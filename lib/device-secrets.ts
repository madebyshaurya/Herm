import { createHash, randomBytes } from "node:crypto"

export function generateDeviceSecret() {
  const raw = `herm_${randomBytes(24).toString("hex")}`

  return {
    raw,
    hash: hashDeviceSecret(raw),
  }
}

export function hashDeviceSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}
