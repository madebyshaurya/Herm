import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { discoverRaspberryPis } from "@/lib/pi-discovery"

export async function GET() {
  await requireUser()

  try {
    const candidates = await discoverRaspberryPis()

    return NextResponse.json({
      ok: true,
      candidates,
      note: "This scan only sees devices that are reachable from the same local network as the machine running Herm.",
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Network discovery failed.",
      },
      { status: 500 }
    )
  }
}
