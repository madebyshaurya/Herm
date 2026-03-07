# Herm Testing Checklist

Local app URL: `http://localhost:3000`

## Before testing

- Confirm `.env.local` is present with Supabase values.
- In Supabase Auth settings, set:
  - Site URL: `http://localhost:3000`
  - Redirect URL: `http://localhost:3000/auth/callback`

## Public routes

- Open `/`
  - Expected: landing page loads without errors.
  - Expected: hero heading, `Open dashboard`, and `Pair your first module` buttons are visible.

- Open `/login`
  - Expected: sign-in card loads.
  - Expected: email input and `Send magic link` button are visible.

- Open `/dashboard` while signed out
  - Expected: redirect to `/login?next=%2Fdashboard`.

## Auth flow

- On `/login`, enter your email and submit.
  - Expected: `Magic link sent. Check your inbox.` message.

- Open the email magic link.
  - Expected: redirect through `/auth/callback`.
  - Expected: land on `/dashboard`.

## Dashboard overview

- Open `/dashboard` after sign-in.
  - Expected: sidebar with `Overview`, `Vehicles`, `Sightings`, `Devices`, `Alerts`.
  - Expected: overview cards render without crashing.
  - Expected: empty states are acceptable if no data exists yet.

## Vehicles flow

- Open `/dashboard/vehicles`.
- Create a vehicle.
  - Expected: vehicle card appears after submit.
  - Expected: plate is normalized for display.

- Update the vehicle.
  - Expected: edited fields persist after refresh.

- Click `Report stolen`.
  - Expected: vehicle status changes to active stolen report.

- Click `Mark recovered`.
  - Expected: active report is closed.

## Devices flow

- Open `/dashboard/devices`.
- Create a device.
  - Expected: redirect back with a one-time setup secret in the URL state.
  - Expected: page shows the setup secret block once.

- Rotate the device secret.
  - Expected: a new secret is shown.
  - Expected: previous secret should no longer authenticate ingest requests.

## Device ingest API

- Test invalid heartbeat secret:

```bash
curl -X POST http://localhost:3000/api/device/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"device_secret":"invalid_secret_value_1234567890","is_camera_online":false,"is_gps_online":false}'
```

  - Expected: `401` with `Invalid device secret`.

- Test valid device secret after creating a device:
  - Use the device secret shown in `/dashboard/devices`.
  - Send heartbeat, plate sighting, and human-detection payloads.
  - Expected: device health and event pages update after refresh or realtime refresh.

## Sightings flow

- Post a valid plate-sighting payload for a created device.
  - Expected: event appears in `/dashboard/sightings`.
  - Expected: matched sightings sort ahead of unmatched sightings.

- If the plate matches an active stolen vehicle:
  - Expected: sighting row shows `Matched`.
  - Expected: overview page shows latest matched sighting.

## Alerts flow

- Post a valid human-detection payload for a created device.
  - Expected: event appears in `/dashboard/alerts`.
  - Expected: overview page shows latest suspicious activity.

## Realtime behavior

- With the dashboard open in one tab, post device events from another tab or terminal.
  - Expected: dashboard refreshes automatically after inserts/updates.

## Automated checks

- Run:

```bash
npm run lint
npm run typecheck
npm run test:e2e
```

  - Expected: all pass.
