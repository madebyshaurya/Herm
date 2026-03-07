# Herm

Herm is the web portal for a crowdsourced stolen-vehicle detection network and Raspberry Pi dashcam modules.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Stack

- Next.js App Router
- Supabase Auth, Postgres, Storage, and Realtime
- shadcn/ui for the application shell
- Magic UI and Aceternity UI for restrained landing-page polish

## Environment

Create `.env.local` from `.env.example`.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# or use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`.env.local` is ignored by git and should never be committed.

## Database

Apply the SQL in `supabase/migrations/202603070001_herm_portal.sql` to your Supabase project.

If you use magic-link auth locally, add `http://localhost:3000/auth/callback` to the Supabase Auth redirect URLs.

You should also set the site URL to `http://localhost:3000` for local development.

If you want GitHub sign-in, enable the GitHub provider in Supabase Auth and add the same callback URL there.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

## Notes

- The dashboard is protected by Supabase Auth middleware.
- Device ingest endpoints live under `/api/device/*`.
- Owner-facing live device reads live under `/api/dashboard/devices/[deviceId]/live`.
- Public snapshots and vehicle images are stored in Supabase Storage buckets created by the migration.
- Apply both SQL migrations in `supabase/migrations/` to enable telemetry samples and live device pages.

## Pi Runtime

The Raspberry Pi runtime lives in `../gps-dashboard`.

- Local debug dashboard: `http://<pi-ip>:3000`
- Local plate batch API: `POST http://<pi-ip>:3000/api/plates`
- Herm ingest targets:
  - `POST /api/device/heartbeat`
  - `POST /api/device/telemetry`
  - `POST /api/device/plate-sighting`

Keep local and production Pi installs separate by changing `HERM_API_BASE_URL` and device secrets.
Use `https://hermai.xyz` for production and a local or tunneled URL for development.
