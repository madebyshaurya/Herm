import jwt from "jsonwebtoken"
import { NextResponse } from "next/server"

/**
 * Generates a short-lived MapKit JS token.
 *
 * Required env vars:
 *   APPLE_TEAM_ID          – Your Apple Developer Team ID (e.g. "ABCDE12345")
 *   APPLE_MAPKIT_KEY_ID    – The Key ID from the MapKit JS key you created
 *   APPLE_MAPKIT_PRIVATE_KEY – The full contents of the .p8 private key file
 *                              (including -----BEGIN PRIVATE KEY----- lines)
 */
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_MAPKIT_KEY_ID
  const privateKey = process.env.APPLE_MAPKIT_PRIVATE_KEY

  if (!teamId || !keyId || !privateKey) {
    return NextResponse.json(
      { error: "Apple MapKit JS not configured. Set APPLE_TEAM_ID, APPLE_MAPKIT_KEY_ID, and APPLE_MAPKIT_PRIVATE_KEY." },
      { status: 503 }
    )
  }

  // Replace escaped newlines (common in env vars)
  const key = privateKey.replace(/\\n/g, "\n")

  const token = jwt.sign({}, key, {
    algorithm: "ES256",
    issuer: teamId,
    expiresIn: "30m",
    keyid: keyId,
    header: {
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    },
  })

  return NextResponse.json({ token })
}
