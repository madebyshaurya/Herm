"use client"

type Satellite = {
  prn: string
  elevation?: number | null
  azimuth?: number | null
  snr?: number | null
}

function snrColor(snr: number | null | undefined): string {
  if (snr == null || snr === 0) return "#6b7280" // gray
  if (snr < 20) return "#ef4444" // red — weak
  if (snr < 35) return "#f59e0b" // amber — moderate
  return "#22c55e" // green — strong
}

export function SatelliteSkyPlot({
  satellites,
  className,
}: {
  satellites: Satellite[]
  className?: string
}) {
  const size = 280
  const cx = size / 2
  const cy = size / 2
  const radius = (size - 40) / 2 // leave padding for labels

  // Convert elevation (0-90°) and azimuth (0-360°) to x,y
  // Elevation 90° = center, 0° = edge
  function toXY(elevation: number, azimuth: number): [number, number] {
    const r = radius * (1 - elevation / 90)
    const angle = ((azimuth - 90) * Math.PI) / 180 // -90 so 0°=North=top
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  const elevationRings = [0, 30, 60, 90]
  const azimuthLines = [0, 45, 90, 135, 180, 225, 270, 315]
  const cardinals: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" }

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] mx-auto">
        {/* Background */}
        <circle cx={cx} cy={cy} r={radius} fill="rgba(0,0,0,0.03)" stroke="currentColor" strokeOpacity={0.1} />

        {/* Elevation rings */}
        {elevationRings.map((el) => {
          const r = radius * (1 - el / 90)
          return (
            <g key={`ring-${el}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray={el === 0 ? "none" : "3,3"}
              />
              {el > 0 && el < 90 && (
                <text
                  x={cx + 3}
                  y={cy - r + 4}
                  fontSize={8}
                  fill="currentColor"
                  opacity={0.3}
                >
                  {el}°
                </text>
              )}
            </g>
          )
        })}

        {/* Azimuth lines */}
        {azimuthLines.map((az) => {
          const [x, y] = toXY(0, az)
          return (
            <line
              key={`az-${az}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
          )
        })}

        {/* Cardinal labels */}
        {Object.entries(cardinals).map(([az, label]) => {
          const angle = ((Number(az) - 90) * Math.PI) / 180
          const labelR = radius + 12
          const x = cx + labelR * Math.cos(angle)
          const y = cy + labelR * Math.sin(angle)
          return (
            <text
              key={`label-${az}`}
              x={x}
              y={y}
              fontSize={10}
              fontWeight={600}
              fill="currentColor"
              opacity={0.5}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {label}
            </text>
          )
        })}

        {/* Satellite dots */}
        {satellites.map((sat) => {
          if (sat.elevation == null || sat.azimuth == null) return null
          const [x, y] = toXY(sat.elevation, sat.azimuth)
          const color = snrColor(sat.snr)
          return (
            <g key={sat.prn}>
              <circle
                cx={x}
                cy={y}
                r={6}
                fill={color}
                opacity={0.9}
                stroke="white"
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y + 14}
                fontSize={7}
                fill="currentColor"
                opacity={0.6}
                textAnchor="middle"
              >
                {sat.prn}
              </text>
            </g>
          )
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="currentColor" opacity={0.3} />
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> Weak
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-amber-500" /> Fair
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-green-500" /> Strong
        </span>
      </div>
    </div>
  )
}
