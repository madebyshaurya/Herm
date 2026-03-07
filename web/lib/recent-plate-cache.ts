import type { PlateSightingRow } from "@/lib/portal-types"

export type RecentPlateEvent = Pick<
  PlateSightingRow,
  | "id"
  | "device_id"
  | "owner_id"
  | "matched_profile_id"
  | "matched_stolen_report_id"
  | "raw_plate"
  | "normalized_plate"
  | "confidence"
  | "latitude"
  | "longitude"
  | "detected_at"
  | "snapshot_url"
  | "created_at"
> & {
  transient: boolean
}

type RecentPlateCacheStore = Map<string, RecentPlateEvent[]>

const RECENT_EVENT_TTL_MS = 10 * 60 * 1000
const RECENT_EVENT_LIMIT = 40

function getStore() {
  const globalCache = globalThis as typeof globalThis & {
    __hermRecentPlateCache?: RecentPlateCacheStore
  }

  if (!globalCache.__hermRecentPlateCache) {
    globalCache.__hermRecentPlateCache = new Map()
  }

  return globalCache.__hermRecentPlateCache
}

function buildKey(ownerId: string, deviceId: string) {
  return `${ownerId}:${deviceId}`
}

function prune(events: RecentPlateEvent[]) {
  const cutoff = Date.now() - RECENT_EVENT_TTL_MS

  return events
    .filter((event) => new Date(event.detected_at).getTime() >= cutoff)
    .sort((left, right) => new Date(right.detected_at).getTime() - new Date(left.detected_at).getTime())
    .slice(0, RECENT_EVENT_LIMIT)
}

export function recordRecentPlateEvents(events: RecentPlateEvent[]) {
  if (!events.length) {
    return
  }

  const store = getStore()
  const grouped = new Map<string, RecentPlateEvent[]>()

  for (const event of events) {
    const key = buildKey(event.owner_id, event.device_id)
    const group = grouped.get(key) ?? []
    group.push(event)
    grouped.set(key, group)
  }

  for (const [key, group] of grouped) {
    const existing = store.get(key) ?? []
    const byId = new Map<string, RecentPlateEvent>()

    for (const event of [...group, ...existing]) {
      byId.set(event.id, event)
    }

    store.set(key, prune([...byId.values()]))
  }
}

export function getRecentPlateEvents(ownerId: string, deviceId: string, limit = 12) {
  const store = getStore()
  const key = buildKey(ownerId, deviceId)
  const events = prune(store.get(key) ?? [])

  if (!events.length) {
    store.delete(key)
    return []
  }

  store.set(key, events)
  return events.slice(0, limit)
}
