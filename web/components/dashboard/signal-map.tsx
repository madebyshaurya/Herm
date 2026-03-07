"use client"

type Point = {
  id: string
  latitude: number | null
  longitude: number | null
  matched?: boolean
}

function normalize(points: Point[]) {
  const withCoordinates = points.filter(
    (point) => point.latitude != null && point.longitude != null
  ) as Array<Point & { latitude: number; longitude: number }>

  if (withCoordinates.length === 0) {
    return []
  }

  const latitudes = withCoordinates.map((point) => point.latitude)
  const longitudes = withCoordinates.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)

  return withCoordinates.map((point) => ({
    ...point,
    top:
      maxLat === minLat ? 50 : 100 - ((point.latitude - minLat) / (maxLat - minLat)) * 100,
    left: maxLng === minLng ? 50 : ((point.longitude - minLng) / (maxLng - minLng)) * 100,
  }))
}

export function SignalMap({ points }: { points: Point[] }) {
  const normalized = normalize(points)

  if (normalized.length === 0) {
    return (
      <div className="subdued-grid flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card/60 text-sm text-muted-foreground">
        No coordinates yet
      </div>
    )
  }

  return (
    <div className="subdued-grid relative h-64 overflow-hidden rounded-lg border border-border bg-card/50">
      {normalized.map((point) => (
        <span
          key={point.id}
          className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ${
            point.matched
              ? "bg-rose-500 ring-rose-500/15"
              : "bg-primary ring-primary/15"
          }`}
          style={{ left: `${point.left}%`, top: `${point.top}%` }}
        />
      ))}
    </div>
  )
}
