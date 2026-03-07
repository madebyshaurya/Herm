"use client"

import { useState } from "react"
import Link from "next/link"
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconLoader2,
  IconDeviceFloppy,
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

type SetupBundleResponse = {
  ok: boolean
  files?: Record<string, string>
  error?: string
}

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: "read" | "readwrite"
      startIn?: "desktop"
    }) => Promise<FileSystemDirectoryHandle>
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
  const [flashState, setFlashState] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [flashError, setFlashError] = useState<string | null>(null)

  async function writeTextFile(directory: FileSystemDirectoryHandle, name: string, content: string) {
    const handle = await directory.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async function flashMountedSdCard() {
    setFlashState("loading")
    setFlashError(null)

    try {
      const pickDirectory = (window as DirectoryPickerWindow).showDirectoryPicker

      if (!pickDirectory) {
        throw new Error("This browser cannot write to mounted drives. Use Chromium in the Codex desktop app.")
      }

      const directory = await pickDirectory({
        id: `herm-${deviceId.slice(0, 8)}`,
        mode: "readwrite",
        startIn: "desktop",
      })

      const cmdlineFile = await directory.getFileHandle("cmdline.txt")
      const configFile = await directory.getFileHandle("config.txt")

      if (!cmdlineFile || !configFile) {
        throw new Error("The selected folder is not a Raspberry Pi OS boot partition.")
      }

      const response = await fetch(bundleUrl, { method: "GET", headers: { Accept: "application/json" } })
      const data = (await response.json()) as SetupBundleResponse

      if (!response.ok || !data.ok || !data.files) {
        throw new Error(data.error || "Failed to load the setup bundle.")
      }

      const bootstrapScript = data.files["bootstrap.sh"]
      const firstBootScript = data.files["firstboot.sh"]

      if (!bootstrapScript || !firstBootScript) {
        throw new Error("The setup bundle is missing SD card provisioning files.")
      }

      const cmdline = await cmdlineFile.getFile()
      const currentCmdline = (await cmdline.text()).trim()
      const runArgs = [
        "systemd.run=/boot/firmware/herm-firstboot.sh",
        "systemd.run_success_action=reboot",
        "systemd.unit=kernel-command-line.target",
      ]
      const nextCmdline = [...currentCmdline.split(/\s+/), ...runArgs.filter((arg) => !currentCmdline.includes(arg))]
        .join(" ")
        .trim()

      await writeTextFile(directory, "herm-bootstrap.sh", bootstrapScript)
      await writeTextFile(directory, "herm-firstboot.sh", firstBootScript)
      await writeTextFile(directory, "cmdline.txt", `${nextCmdline}\n`)
      await writeTextFile(directory, "herm-device.json", JSON.stringify({ deviceId, deviceName }, null, 2) + "\n")

      setFlashState("done")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFlashState("idle")
        return
      }

      setFlashState("error")
      setFlashError(error instanceof Error ? error.message : "Failed to flash the SD card.")
    }
  }

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
              <Button onClick={flashMountedSdCard} type="button">
                {flashState === "loading" ? <IconLoader2 className="animate-spin" /> : <IconDeviceFloppy />}
                {flashState === "done" ? "SD card flashed" : "Flash mounted SD card"}
              </Button>
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
            {flashError ? <p className="text-sm text-destructive">{flashError}</p> : null}
            {flashState === "done" ? (
              <p className="text-sm text-emerald-600">
                Herm wrote the first-boot payload onto the selected boot partition. Eject the card and boot the Pi.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3">
            {[
              "Flash Raspberry Pi OS Lite with Raspberry Pi Imager first.",
              "Insert the SD card, open its mounted boot partition, and use Flash mounted SD card.",
              "Boot the Pi. Herm runs the bootstrap once, installs the timer, then removes the first-boot hook.",
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
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconExternalLink className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">SD card flashing notes</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Herm writes to the mounted Raspberry Pi OS boot partition, not the raw block device. The SD card must
            already be imaged, and you need to select the volume that contains `cmdline.txt` and `config.txt`.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            On first boot, Herm runs the generated bootstrap, enables the heartbeat timer, and removes its own
            first-boot hook so the Pi starts normally afterward.
          </p>
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
