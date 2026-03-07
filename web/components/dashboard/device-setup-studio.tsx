"use client"

import { useState } from "react"
import Link from "next/link"
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconLoader2,
  IconSearch,
  IconTerminal2,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <Button onClick={handleCopy} size="sm" type="button" variant="outline">
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? "Copied" : label}
    </Button>
  )
}

function FilePreview({
  filename,
  content,
  copyLabel,
}: {
  filename: string
  content: string
  copyLabel: string
}) {
  return (
    <Card className="border-border/70 bg-background/55 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-sm">{filename}</CardTitle>
          <CardDescription>Provisioning file preview</CardDescription>
        </div>
        <CopyButton value={content} label={copyLabel} />
      </CardHeader>
      <CardContent>
        <Textarea className="min-h-48 font-mono text-[11px]" readOnly value={content} />
      </CardContent>
    </Card>
  )
}

type DiscoveryCandidate = {
  address: string
  label: string
  source: "mdns" | "scan"
}

export function DeviceSetupStudio({
  deviceId,
  deviceName,
  bootstrapCommand,
  bootstrapUrl,
  bundleUrl,
  envPreview,
  scriptPreview,
}: {
  deviceId: string
  deviceName: string
  bootstrapCommand: string
  bootstrapUrl: string
  bundleUrl: string
  envPreview: string
  scriptPreview: string
}) {
  const [scanState, setScanState] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [scanError, setScanError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([])

  async function runDiscovery() {
    setScanState("loading")
    setScanError(null)

    try {
      const response = await fetch("/api/device/discover", { method: "GET" })
      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Discovery failed.")
      }

      setCandidates(data.candidates ?? [])
      setScanState("done")
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Discovery failed.")
      setCandidates([])
      setScanState("error")
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden border-border/70 bg-card/92">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Setup studio</p>
              <CardTitle className="mt-2 text-xl tracking-tight">Herm Web Flasher beta</CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
                This is the fast path that actually works with Raspberry Pi setup. Herm generates a
                device-linked bootstrap script, embeds the auth secret, installs a heartbeat timer,
                and keeps the module paired on first boot.
              </CardDescription>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
{`┌─ herm web flasher ─────────────────────┐
│ target  : ${deviceName.padEnd(27, " ")}│
│ device  : ${deviceId.slice(0, 8)}...                 │
│ auth    : embedded in bootstrap        │
│ output  : env + timer + first heartbeat│
└─────────────────────────────────────────┘`}
            </pre>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">One-line install command</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Run this on a freshly imaged Raspberry Pi OS machine after it has internet access.
                  </p>
                </div>
                <CopyButton value={bootstrapCommand} label="Copy command" />
              </div>
              <Textarea className="mt-3 min-h-24 font-mono text-[11px]" readOnly value={bootstrapCommand} />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link download href={bootstrapUrl}>
                  <IconDownload />
                  Download bootstrap
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link download href={bundleUrl}>
                  <IconDownload />
                  Download setup bundle
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              "Flash Raspberry Pi OS Lite with Raspberry Pi Imager.",
              "Boot the Pi and connect it to Wi-Fi or ethernet.",
              "Run the bootstrap command once. Herm writes the env, timer, and first heartbeat automatically.",
              "Install your detector runtime later without redoing device auth.",
            ].map((step, index) => (
              <div key={step} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Step {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <FilePreview content={envPreview} copyLabel="Copy env" filename="device.env" />
        <FilePreview content={scriptPreview} copyLabel="Copy script" filename="bootstrap.sh" />
      </div>

      <Card className="border-border/70 bg-card/92">
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconTerminal2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">What this installs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            ["`/etc/herm/device.env`", "Stores the device ID, backend origin, and embedded secret."],
            ["`/usr/local/bin/herm-heartbeat`", "Posts authenticated heartbeat events back to the Herm portal."],
            ["`systemd timer`", "Keeps the device linked every two minutes without further setup."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-mono text-[11px] text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/92">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Local network assist</p>
              <CardTitle className="mt-2 text-sm">Find reachable Raspberry Pis</CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
                If Herm is running on the same Wi-Fi or ethernet network as the Pi, it can look for SSH-ready
                devices and give you a paste-ready bootstrap command for each one.
              </CardDescription>
            </div>
            <Button onClick={runDiscovery} type="button" variant="outline">
              {scanState === "loading" ? <IconLoader2 className="animate-spin" /> : <IconSearch />}
              Scan local network
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {scanError ? <p className="text-sm text-destructive">{scanError}</p> : null}
          {scanState === "done" && candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SSH-ready Raspberry Pis were found from this machine. If the Pi is reachable, you can still SSH
              manually and run the bootstrap command above.
            </p>
          ) : null}
          {candidates.map((candidate) => {
            const sshCommand = `ssh pi@${candidate.address} \"curl -fsSL '${bootstrapUrl}' | sudo bash\"`

            return (
              <Card key={candidate.address} className="border-border/70 bg-background/60 shadow-none">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="text-sm">{candidate.label}</CardTitle>
                    <CardDescription>
                      {candidate.address} · found by {candidate.source === "mdns" ? "mDNS" : "SSH scan"}
                    </CardDescription>
                  </div>
                  <CopyButton value={sshCommand} label="Copy SSH command" />
                </CardHeader>
                <CardContent>
                  <Textarea className="min-h-24 font-mono text-[11px]" readOnly value={sshCommand} />
                </CardContent>
              </Card>
            )
          })}
          <p className="text-xs leading-5 text-muted-foreground">
            The generated SSH command assumes the Pi username is `pi`. If you used Raspberry Pi Imager to set a
            custom username, replace `pi` before running it.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
