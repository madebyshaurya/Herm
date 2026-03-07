import { BlurFade } from "@/components/ui/blur-fade"

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
    <BlurFade delay={0.05} inView>
      <div className="mb-8 space-y-3">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
        <div className="h-px w-16 bg-gradient-to-r from-primary/60 to-transparent" />
      </div>
    </BlurFade>
  )
}
