import { cn } from "@/lib/utils"
import {
  IconInbox,
} from "@tabler/icons-react"

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center fade-in-up">
      <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
        {icon ?? <IconInbox className="h-8 w-8" stroke={1.5} />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
