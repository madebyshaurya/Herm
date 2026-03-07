"use client"

import { useState, useTransition } from "react"
import { IconBrandGithub } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBrowserSupabaseClient } from "@/lib/supabase/browser"

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function buildRedirectUrl() {
    const redirectTo = new URL("/auth/callback", window.location.origin)
    redirectTo.searchParams.set("next", next)
    return redirectTo
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()

        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: buildRedirectUrl().toString(),
          },
        })

        if (signInError) {
          throw signInError
        }

        setMessage("Magic link sent. Check your inbox.")
      } catch (submissionError) {
        const fallback = "Could not send magic link."
        const nextMessage =
          submissionError instanceof Error ? submissionError.message : fallback
        setError(nextMessage)
      }
    })
  }

  function onGoogleSignIn() {
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const statusResponse = await fetch("/api/auth/github/status")
        const statusPayload = (await statusResponse.json()) as {
          enabled?: boolean
          error?: string
        }

        if (!statusResponse.ok || !statusPayload.enabled) {
          throw new Error(statusPayload.error || "GitHub sign-in is not enabled.")
        }

        const supabase = createBrowserSupabaseClient()
        const { data, error: signInError } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: buildRedirectUrl().toString(),
            skipBrowserRedirect: true,
          },
        })

        if (signInError) {
          throw signInError
        }

        if (!data?.url) {
          throw new Error("GitHub sign-in is not available right now.")
        }

        window.location.assign(data.url)
      } catch (submissionError) {
        const fallback = "Could not start GitHub sign-in."
        const nextMessage =
          submissionError instanceof Error ? submissionError.message : fallback
        setError(nextMessage)
      }
    })
  }

  return (
    <Card className="w-full max-w-md border-border/70 bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use GitHub first. Email magic link is still available as a fallback.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button className="w-full" disabled={isPending} type="button" variant="outline" onClick={onGoogleSignIn}>
            <IconBrandGithub />
            Continue with GitHub
          </Button>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>Email fallback</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Sending..." : "Send magic link"}
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
