import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const user = await requireUser()
  const { deviceId } = await params
  const url = new URL(request.url)
  const role = url.searchParams.get("role")

  const supabase = await createServerSupabaseClient()

  // Verify ownership
  const { data: device } = await supabase
    .from("devices")
    .select("id")
    .eq("id", deviceId)
    .eq("owner_id", user.id)
    .maybeSingle()

  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (role) {
    // Return single frame as JPEG image
    const { data: frame } = await supabase
      .from("device_frames")
      .select("frame_base64, camera_name, updated_at")
      .eq("device_id", deviceId)
      .eq("role", role)
      .maybeSingle()

    if (!frame?.frame_base64) {
      return new Response(null, { status: 204 })
    }

    const jpeg = Buffer.from(frame.frame_base64, "base64")
    return new Response(jpeg, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Camera-Name": frame.camera_name || "",
        "X-Frame-Time": frame.updated_at || "",
      },
    })
  }

  // Return all camera frames as JSON
  const { data: frames } = await supabase
    .from("device_frames")
    .select("role, camera_name, frame_base64, updated_at")
    .eq("device_id", deviceId)
    .order("role")

  return NextResponse.json({
    ok: true,
    cameras: (frames || []).map((f) => ({
      role: f.role,
      name: f.camera_name,
      hasFrame: !!f.frame_base64,
      updatedAt: f.updated_at,
      frame: f.frame_base64,
    })),
  })
}
