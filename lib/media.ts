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

export async function insertMediaAsset(input: {
  ownerId: string
  bucketId: "event-snapshots" | "vehicle-media"
  upload: UploadResult
  relatedType: "vehicle" | "plate_sighting" | "human_detection"
  relatedId: string
}) {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("media_assets")
    .insert({
      owner_id: input.ownerId,
      bucket_id: input.bucketId,
      storage_path: input.upload.path,
      public_url: input.upload.publicUrl,
      mime_type: input.upload.mimeType,
      bytes_size: input.upload.bytesSize,
      related_type: input.relatedType,
      related_id: input.relatedId,
    })
    .select("id, public_url")
    .single()

  if (error) {
    throw error
  }

  return data
}
