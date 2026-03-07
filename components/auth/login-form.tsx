"use client"

import { useState, useTransition } from "react"

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

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const redirectTo = new URL("/auth/callback", window.location.origin)
        redirectTo.searchParams.set("next", next)

        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectTo.toString(),
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

  return (
    <Card className="w-full max-w-md border-border/70 bg-card/90 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your email to access the Herm dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
