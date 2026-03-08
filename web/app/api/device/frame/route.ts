import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticateDeviceSecret } from "@/lib/device-auth"
import { createAdminSupabaseClient } from "@/lib/supabase/admin"

const frameSchema = z.object({
  device_secret: z.string().min(20),
  frames: z.array(
    z.object({
      role: z.string().min(1),
      camera_name: z.string().optional(),
      frame_base64: z.string().min(100),
    })
  ),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = frameSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const auth = await authenticateDeviceSecret(parsed.data.device_secret)
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminSupabaseClient()
    const now = new Date().toISOString()

    const rows = parsed.data.frames.map((f) => ({
      device_id: auth.deviceId,
      role: f.role,
      camera_name: f.camera_name || null,
      frame_base64: f.frame_base64,
      updated_at: now,
    }))

    const { error } = await admin.from("device_frames").upsert(rows, {
      onConflict: "device_id,role",
    })

    if (error) {
      console.error("Frame upsert error:", error)
      return NextResponse.json({ error: "Storage error" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, stored: rows.length })
  } catch (err) {
    console.error("Frame endpoint error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
