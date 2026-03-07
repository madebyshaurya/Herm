import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const palette = {
  active: "bg-amber-500/12 text-amber-700 dark:text-amber-200",
  recovered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
  online: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
  offline: "bg-stone-500/12 text-stone-700 dark:text-stone-200",
  provisioning: "bg-sky-500/12 text-sky-700 dark:text-sky-200",
  matched: "bg-rose-500/12 text-rose-700 dark:text-rose-200",
}

export function StatusPill({
  children,
  tone = "offline",
}: {
  children: React.ReactNode
  tone?: keyof typeof palette
}) {
  return (
    <Badge className={cn("rounded-full border-0 px-2 py-0.5 font-medium", palette[tone])}>
      {children}
    </Badge>
  )
}
