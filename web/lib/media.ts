import { randomUUID } from "node:crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin"

type UploadResult = {
  path: string
  publicUrl: string
  mimeType: string | null
  bytesSize: number
}

export async function uploadFileToBucket(
  file: File,
  bucket: "event-snapshots" | "vehicle-media",
  prefix: string
): Promise<UploadResult> {
  const admin = createAdminSupabaseClient()
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin"
  const path = `${prefix}/${randomUUID()}.${extension}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || undefined,
    upsert: false,
  })

  if (error) {
    throw error
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path)

  return {
    path,
    publicUrl: data.publicUrl,
    mimeType: file.type || null,
    bytesSize: buffer.byteLength,
  }
}
