import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

// Use verified domain if available, otherwise Resend's test sender
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Herm Alerts <onboarding@resend.dev>"

function mapsUrl(lat: number, lon: number) {
  return `https://www.google.com/maps?q=${lat},${lon}`
}

/**
 * Send a stolen-plate sighting email to the vehicle owner.
 * Best-effort — never throws.
 */
export async function sendStolenPlateEmail({
  ownerEmail,
  plate,
  latitude,
  longitude,
  detectedAt,
  snapshotUrl,
  sightingId,
}: {
  ownerEmail: string
  plate: string
  latitude: number | null
  longitude: number | null
  detectedAt: string
  snapshotUrl: string | null
  sightingId: string
}) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping stolen plate email")
    return
  }

  const time = new Date(detectedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })
  const locationText =
    latitude != null && longitude != null
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      : "Unknown location"
  const locationLink =
    latitude != null && longitude != null
      ? mapsUrl(latitude, longitude)
      : null

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: ownerEmail,
      subject: `🚨 Your vehicle (${plate}) was just spotted`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#dc2626;padding:24px 28px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🚨 Stolen Vehicle Spotted</h1>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#334155;">
        A Herm dashcam just detected your reported vehicle:
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#991b1b;font-weight:600;">License Plate</p>
        <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626;letter-spacing:2px;font-family:monospace;">${plate}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#475569;">
        <tr>
          <td style="padding:8px 0;font-weight:600;">📍 Location</td>
          <td style="padding:8px 0;text-align:right;">
            ${locationLink
              ? `<a href="${locationLink}" style="color:#2563eb;text-decoration:underline;">${locationText}</a>`
              : locationText}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:600;">🕐 Time (UTC)</td>
          <td style="padding:8px 0;text-align:right;">${time}</td>
        </tr>
      </table>
      ${snapshotUrl ? `
      <div style="margin-top:20px;">
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600;">📷 Snapshot</p>
        <img src="${snapshotUrl}" alt="Detection snapshot" style="width:100%;border-radius:12px;border:1px solid #e2e8f0;" />
      </div>` : ""}
      <div style="margin-top:24px;text-align:center;">
        <a href="https://hermai.xyz/dashboard/alerts"
           style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">
          View in Dashboard →
        </a>
      </div>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">
        Herm — Crowdsourced stolen vehicle detection · <a href="https://hermai.xyz" style="color:#64748b;">hermai.xyz</a>
      </p>
    </div>
  </div>
</body>
</html>`,
    })

    if (error) {
      console.error(`[email] Resend API error for ${ownerEmail}:`, JSON.stringify(error))
      return
    }

    console.log(`[email] Stolen plate alert sent to ${ownerEmail} for ${plate} (id: ${data?.id}, sighting ${sightingId})`)
  } catch (err) {
    console.error(`[email] Failed to send stolen plate alert:`, err)
  }
}
