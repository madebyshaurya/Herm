import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const palette = {
  active: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20",
  recovered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20",
  offline: "bg-stone-500/12 text-stone-600 dark:text-stone-300 ring-1 ring-stone-500/15",
  provisioning: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/20",
  matched: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20",
}

const dotColor = {
  active: "bg-amber-500",
  recovered: "bg-emerald-500",
  online: "bg-emerald-500",
  offline: "bg-stone-400",
  provisioning: "bg-sky-500",
  matched: "bg-rose-500",
}

const animated = new Set<string>(["active", "matched", "online"])

export function StatusPill({
  children,
  tone = "offline",
}: {
  children: React.ReactNode
  tone?: keyof typeof palette
}) {
  return (
    <Badge className={cn("gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-medium", palette[tone])}>
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          dotColor[tone],
          animated.has(tone) && "pulse-dot"
        )}
      />
      {children}
    </Badge>
  )
}
