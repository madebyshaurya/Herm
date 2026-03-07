import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed bg-card/75">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Add your first record to populate this view.
      </CardContent>
    </Card>
  )
}
