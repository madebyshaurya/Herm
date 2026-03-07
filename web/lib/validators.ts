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
  serial_connected: z.boolean().optional().default(false),
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

export const plateBatchSchema = z.object({
  device_secret: z.string().min(20),
  plates: z.array(z.string().trim().min(2).max(16)).min(1).max(16),
  confidenceByPlate: z.record(z.string(), z.number().min(0).max(1)).optional(),
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

export const satelliteReadingSchema = z.object({
  prn: z.string().trim().min(1).max(24),
  elevation: z.number().nullable().optional(),
  azimuth: z.number().nullable().optional(),
  snr: z.number().nullable().optional(),
})

export const telemetrySchema = z.object({
  device_secret: z.string().min(20),
  firmware_version: z.string().trim().max(64).optional().nullable(),
  timestamp: z.string().datetime().optional(),
  serial: z.object({
    path: z.string().trim().min(1).max(128),
    connected: z.boolean(),
    lastError: z.string().trim().max(240).nullable().optional(),
  }),
  gnss: z.object({
    fix: z.boolean().default(false),
    fixQuality: z.number().int().min(0).max(9).default(0),
    mode: z.number().int().min(1).max(4).default(1),
    statusText: z.string().trim().min(1).max(32).default("SEARCHING"),
    lat: z.number().nullable().optional(),
    lon: z.number().nullable().optional(),
    alt: z.number().nullable().optional(),
    speedKmh: z.number().nullable().optional(),
    heading: z.number().nullable().optional(),
    hdop: z.number().nullable().optional(),
    vdop: z.number().nullable().optional(),
    pdop: z.number().nullable().optional(),
    satsInUse: z.number().int().min(0).max(64).default(0),
    satsInView: z.number().int().min(0).max(128).default(0),
    timestampUtc: z.string().trim().max(32).nullable().optional(),
    source: z.string().trim().max(32).default("GNSS"),
  }),
  satellites: z.array(satelliteReadingSchema).max(32).default([]),
  system: z.object({
    cpuPercent: z.number().min(0).max(100).nullable().optional(),
    ramUsedMb: z.number().int().min(0).nullable().optional(),
    ramTotalMb: z.number().int().min(0).nullable().optional(),
    tempC: z.number().nullable().optional(),
    ip: z.string().trim().max(64).nullable().optional(),
    uptimeSec: z.number().int().min(0).nullable().optional(),
    internet: z.boolean().default(false),
  }),
})
