import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const messages = {
  missing_env: {
    title: "Supabase keys are not configured yet",
    description:
      "Add your project credentials to `.env.local` before testing the protected dashboard.",
  },
  missing_schema: {
    title: "Supabase is connected, but the Herm schema is not installed",
    description:
      "Apply the SQL migration in `supabase/migrations` so vehicles, devices, sightings, and alerts can load correctly.",
  },
  unavailable: {
    title: "Supabase is not ready yet",
    description:
      "The app can reach Supabase, but the portal tables are not readable right now. Check the migration and project configuration.",
  },
} as const

export function SetupRequired({
  mode = "missing_env",
}: {
  mode?: keyof typeof messages
}) {
  const message = messages[mode]

  return (
    <div className="page-shell flex min-h-[70vh] items-center py-16">
      <Card className="mx-auto max-w-xl border-dashed bg-card/80">
        <CardHeader>
          <CardTitle>{message.title}</CardTitle>
          <CardDescription>{message.description}</CardDescription>
        </CardHeader>
        <CardContent className="font-mono text-xs text-muted-foreground">
          NEXT_PUBLIC_SUPABASE_URL
          <br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY
          <br />
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          <br />
          SUPABASE_SERVICE_ROLE_KEY
        </CardContent>
      </Card>
    </div>
  )
}
