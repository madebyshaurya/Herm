import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

/**
 * POST /api/device/push-setup
 *
 * Pushes the Herm bootstrap script to a Raspberry Pi over the network.
 * The web portal discovers Pis via /api/device/discover, then this endpoint
 * SSHs into the selected Pi and runs the bootstrap.
 *
 * For hackathon simplicity, this endpoint generates a curl command that the
 * user's browser executes via the Pi's existing SSH or HTTP endpoint.
 *
 * In practice for the hackathon: we return the command to run, and the user
 * can also use the Pi runtime's OTA endpoint if it's already running Herm.
 */
export async function POST(request: NextRequest) {
  await requireUser()

  try {
    const body = await request.json()
    const {
      piAddress,
      deviceId,
      deviceSecret,
      bootstrapUrl,
      wifiSsid,
      wifiPassword,
      wifiCountry,
      profile,
    } = body

    if (!piAddress || !deviceId || !deviceSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields (piAddress, deviceId, deviceSecret)" },
        { status: 400 }
      )
    }

    // Try OTA endpoint first (Pi already running Herm)
    const otaPayload = {
      deviceId,
      deviceSecret,
      bootstrapUrl,
      wifiSsid,
      wifiPassword,
      wifiCountry,
      profile: profile || "auto",
    }

    try {
      const otaRes = await fetch(`http://${piAddress}:3000/api/ota/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(otaPayload),
        signal: AbortSignal.timeout(5000),
      })

      if (otaRes.ok) {
        return NextResponse.json({
          ok: true,
          method: "ota",
          message: "Setup pushed to Pi via OTA endpoint. Pi is reconfiguring.",
        })
      }
    } catch {
      // OTA endpoint not available — Pi may not be running Herm yet
    }

    // Fallback: generate commands for manual execution or SSH
    // For the hackathon, we provide the bootstrap command
    const bootstrapCommand = bootstrapUrl
      ? `curl -fsSL '${bootstrapUrl}' | sudo bash`
      : `# Bootstrap URL not available — configure manually`

    return NextResponse.json({
      ok: true,
      method: "manual",
      message: "Pi doesn't have Herm installed yet. Run the command below via SSH.",
      piAddress,
      sshCommand: `ssh pi@${piAddress} "${bootstrapCommand}"`,
      bootstrapCommand,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Push setup failed",
      },
      { status: 500 }
    )
  }
}
