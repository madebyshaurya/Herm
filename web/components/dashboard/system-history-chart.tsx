"use client"

import { useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

type SystemSample = {
  time: string
  cpu: number | null
  temp: number | null
  ram: number | null
  ramTotal: number | null
}

function MiniChart({
  data,
  dataKey,
  color,
  label,
  unit,
  domain,
}: {
  data: SystemSample[]
  dataKey: keyof SystemSample
  color: string
  label: string
  unit: string
  domain?: [number, number]
}) {
  const latestValue = data.length > 0 ? data[data.length - 1][dataKey] : null

  return (
    <div className="rounded-xl border border-border/70 bg-card/92 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {latestValue != null ? `${typeof latestValue === "number" ? latestValue.toFixed(1) : latestValue}${unit}` : "—"}
        </span>
      </div>
      <div className="h-[80px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
            <XAxis dataKey="time" hide />
            <YAxis domain={domain || ["auto", "auto"]} hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "none",
                borderRadius: 8,
                fontSize: 11,
                color: "#fff",
              }}
              labelStyle={{ color: "#999", fontSize: 10 }}
              formatter={(value) => [`${Number(value ?? 0).toFixed(1)}${unit}`, label]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SystemHistoryChart({ history }: { history: SystemSample[] }) {
  const chartData = useMemo(() => {
    return history.map((s) => ({
      ...s,
      time: s.time,
    }))
  }, [history])

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <MiniChart
        data={chartData}
        dataKey="cpu"
        color="#3b82f6"
        label="CPU"
        unit="%"
        domain={[0, 100]}
      />
      <MiniChart
        data={chartData}
        dataKey="temp"
        color="#f97316"
        label="Temperature"
        unit="°C"
        domain={[20, 85]}
      />
      <MiniChart
        data={chartData}
        dataKey="ram"
        color="#8b5cf6"
        label="RAM"
        unit=" MB"
      />
    </div>
  )
}

export type { SystemSample }
