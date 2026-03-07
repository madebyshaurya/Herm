import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function StatCard({
  title,
  value,
  description,
}: {
  title: string
  value: React.ReactNode
  description: string
}) {
  return (
    <Card className="border-border/70 bg-card/88">
      <CardHeader className="gap-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  )
}
