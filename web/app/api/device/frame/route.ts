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

let tableVerified = false

async function ensureTable(admin: ReturnType<typeof createAdminSupabaseClient>) {
  if (tableVerified) return
  // Quick probe — if select works, table exists
  const { error } = await admin.from("device_frames").select("device_id").limit(0)
  if (!error) {
    tableVerified = true
    return
  }
  // Table missing — create it
  console.log("device_frames table missing, creating...")
  const { error: rpcErr } = await admin.rpc("exec_sql" as string, {
    sql: `create table if not exists public.device_frames (
      device_id uuid not null references public.devices(id) on delete cascade,
      role text not null default 'usb-0',
      camera_name text,
      frame_base64 text not null,
      updated_at timestamptz not null default now(),
      primary key (device_id, role)
    ); alter table public.device_frames enable row level security;`,
  })
  if (rpcErr) {
    // RPC might not exist — log but don't fail, user must create table manually
    console.warn("Auto-create failed (user must create table manually):", rpcErr.message)
  }
  tableVerified = true
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = frameSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 })
    }

    const auth = await authenticateDeviceSecret(parsed.data.device_secret)
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminSupabaseClient()
    await ensureTable(admin)

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
      return NextResponse.json({ error: "Storage error", detail: error.message }, { status: 500 })
    }

    // Broadcast each frame via Supabase Realtime for live streaming
    for (const f of parsed.data.frames) {
      admin.channel(`device-frames:${auth.deviceId}`).send({
        type: "broadcast",
        event: "frame",
        payload: {
          role: f.role,
          camera_name: f.camera_name || null,
          frame: f.frame_base64,
        },
      }).catch(() => {/* best-effort */})
    }

    return NextResponse.json({ ok: true, stored: rows.length, device_id: auth.deviceId })
  } catch (err) {
    console.error("Frame endpoint error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
