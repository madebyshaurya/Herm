import { lookup } from "node:dns/promises"
import { networkInterfaces } from "node:os"
import net from "node:net"

export type PiCandidate = {
  address: string
  label: string
  source: "mdns" | "scan"
}

function isPrivateIPv4(address: string) {
  return (
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  )
}

function getSubnets() {
  const interfaces = networkInterfaces()
  const subnets = new Set<string>()

  Object.values(interfaces).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateIPv4(entry.address)) {
        return
      }

      const parts = entry.address.split(".")
      subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`)
    })
  })

  return Array.from(subnets).slice(0, 2)
}

function probeSsh(address: string, timeoutMs = 220) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finish = (value: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
    socket.connect(22, address)
  })
}

async function resolveMdnsCandidates() {
  const candidates = ["raspberrypi.local", "herm-pi.local"]
  const results: PiCandidate[] = []

  await Promise.all(
    candidates.map(async (hostname) => {
      try {
        const resolved = await lookup(hostname)

        if (await probeSsh(resolved.address)) {
          results.push({
            address: resolved.address,
            label: hostname,
            source: "mdns",
          })
        }
      } catch {
        // Ignore missing mDNS hostnames.
      }
    })
  )

  return results
}

async function scanSubnet(prefix: string) {
  const addresses = Array.from({ length: 253 }, (_, index) => `${prefix}.${index + 2}`)
  const matches: PiCandidate[] = []
  const concurrency = 32

  for (let index = 0; index < addresses.length; index += concurrency) {
    const batch = addresses.slice(index, index + concurrency)
    const results = await Promise.all(
      batch.map(async (address) => ({
        address,
        ok: await probeSsh(address),
      }))
    )

    results.forEach((result) => {
      if (result.ok) {
        matches.push({
          address: result.address,
          label: result.address,
          source: "scan",
        })
      }
    })
  }

  return matches
}

export async function discoverRaspberryPis() {
  const mdns = await resolveMdnsCandidates()
  const seen = new Set(mdns.map((candidate) => candidate.address))
  const subnets = getSubnets()
  const scanResults = (
    await Promise.all(subnets.map((subnet) => scanSubnet(subnet)))
  ).flat()

  const merged = [...mdns]

  scanResults.forEach((candidate) => {
    if (seen.has(candidate.address)) {
      return
    }

    seen.add(candidate.address)
    merged.push(candidate)
  })

  return merged.slice(0, 16)
}
