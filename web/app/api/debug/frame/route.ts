import { NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin"

// Debug endpoint — returns frames without auth for testing.
// Remove before production.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const deviceId = url.searchParams.get("deviceId") || "d5bc8ac3-d47d-4fb0-a966-27db26c76a4e"

  const admin = createAdminSupabaseClient()

  const { data: frames, error } = await admin
    .from("device_frames")
    .select("role, camera_name, frame_base64, updated_at")
    .eq("device_id", deviceId)
    .order("role")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!frames || frames.length === 0) {
    return NextResponse.json({
      ok: false,
      message: "No frames in database for this device",
      deviceId,
    })
  }

  return NextResponse.json({
    ok: true,
    deviceId,
    cameras: frames.map((f) => ({
      role: f.role,
      name: f.camera_name,
      hasFrame: !!f.frame_base64,
      frameLength: f.frame_base64?.length || 0,
      updatedAt: f.updated_at,
      frame: f.frame_base64,
    })),
  })
}
