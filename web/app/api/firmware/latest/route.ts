import { NextResponse } from "next/server"

const GITHUB_REPO = "madebyshaurya/Herm"
const ASSET_NAME = "herm-os-arm64.img.xz"

/**
 * GET /api/firmware/latest
 *
 * Returns the download URL for the latest Herm OS firmware image.
 * This proxies the GitHub Releases API so the user never visits GitHub.
 */
export async function GET() {
  try {
    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 }, // cache 5 min
      }
    )

    if (!releaseRes.ok) {
      // No release yet — return the direct URL as fallback
      return NextResponse.json({
        ok: true,
        downloadUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/${ASSET_NAME}`,
        version: "latest",
        note: "No published release found — using direct URL.",
      })
    }

    const release = await releaseRes.json()
    const asset = release.assets?.find(
      (a: { name: string }) => a.name === ASSET_NAME
    )

    return NextResponse.json({
      ok: true,
      downloadUrl: asset
        ? asset.browser_download_url
        : `https://github.com/${GITHUB_REPO}/releases/latest/download/${ASSET_NAME}`,
      version: release.tag_name ?? "unknown",
      releaseName: release.name ?? null,
      publishedAt: release.published_at ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch firmware info",
      },
      { status: 500 }
    )
  }
}
