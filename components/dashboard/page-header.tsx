export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) {
  return (
    <div className="mb-6 space-y-2">
      {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p> : null}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>
    </div>
  )
}
