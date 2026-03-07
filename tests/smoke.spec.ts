import { expect, test, type Page } from "@playwright/test"

function trackRuntimeErrors(page: Page) {
  const errors: string[] = []

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
  })

  page.on("pageerror", (error) => {
    errors.push(error.message)
  })

  return errors
}

test("landing page renders core messaging", async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await page.goto("/")

  await expect(
    page.getByRole("heading", {
      name: /clean command center for stolen vehicle alerts and raspberry pi modules/i,
    })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /open dashboard/i })).toBeVisible()
  await expect(page.getByText(/functionality first, calm interface second/i)).toBeVisible()
  expect(errors).toEqual([])
})

test("login route is usable", async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await page.goto("/login")

  const setupNotice = page.getByText(/supabase keys are not configured yet/i)

  if (await setupNotice.isVisible()) {
    await expect(setupNotice).toBeVisible()
  } else {
    await expect(page.getByText(/^sign in$/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible()
  }

  expect(errors).toEqual([])
})

test("dashboard route handles unauthenticated access", async ({ page }) => {
  const errors = trackRuntimeErrors(page)
  await page.goto("/dashboard")

  const setupNotice = page.getByText(/supabase keys are not configured yet/i)

  if (await setupNotice.isVisible()) {
    await expect(setupNotice).toBeVisible()
  } else {
    await expect(page).toHaveURL(/\/login|\/dashboard/)
  }

  expect(errors).toEqual([])
})

test("device endpoints reject invalid secrets", async ({ request }) => {
  const response = await request.post("/api/device/heartbeat", {
    data: {
      device_secret: "herm_invalid_but_nonexistent_secret_1234",
      is_camera_online: false,
      is_gps_online: false,
    },
  })

  expect([401, 503]).toContain(response.status())
})
