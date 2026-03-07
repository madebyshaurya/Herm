"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { NumberTicker } from "@/components/ui/number-ticker"

export function StatCard({
  title,
  value,
  description,
  icon,
  gradient = "blue",
}: {
  title: string
  value: ReactNode
  description: string
  icon?: ReactNode
  gradient?: "blue" | "emerald" | "amber" | "rose"
}) {
  const gradientClass = {
    blue: "stat-gradient-blue",
    emerald: "stat-gradient-emerald",
    amber: "stat-gradient-amber",
    rose: "stat-gradient-rose",
  }[gradient]

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
        gradientClass
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {title}
        </p>
        {icon && (
          <div className="rounded-lg bg-background/60 p-1.5 text-muted-foreground transition-colors group-hover:text-foreground">
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">
        {typeof value === "number" ? (
          <NumberTicker value={value} className="text-3xl font-bold tracking-tight" />
        ) : (
          value
        )}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
