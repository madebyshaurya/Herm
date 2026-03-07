import { z } from "zod"

export const vehicleSchema = z.object({
  nickname: z.string().trim().max(80).optional().or(z.literal("")),
  plateRaw: z.string().trim().min(2).max(16),
  make: z.string().trim().max(40).optional().or(z.literal("")),
  model: z.string().trim().max(40).optional().or(z.literal("")),
  color: z.string().trim().max(30).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
})

export const stolenReportSchema = z.object({
  vehicleId: z.string().uuid(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
})

export const deviceSchema = z.object({
  name: z.string().trim().min(2).max(60),
})

export const heartbeatSchema = z.object({
  device_secret: z.string().min(20),
  firmware_version: z.string().trim().max(64).optional().nullable(),
  is_camera_online: z.boolean().default(false),
  is_gps_online: z.boolean().default(false),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timestamp: z.string().datetime().optional(),
})

export const plateSightingSchema = z.object({
  device_secret: z.string().min(20),
  plateRaw: z.string().min(2),
  plateNormalized: z.string().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timestamp: z.string().datetime().optional(),
})

export const humanDetectionSchema = z.object({
  device_secret: z.string().min(20),
  confidence: z.number().min(0).max(1).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timestamp: z.string().datetime().optional(),
})
