# Herm

Herm is organized as a small monorepo.

## Apps

- `web/`: Next.js web portal for the Herm dashboard and marketing site
- `gps-dashboard/`: Raspberry Pi runtime with local debug UI, heartbeat, telemetry, and plate forwarding

## Quick start

```bash
npm install
cp web/.env.example web/.env.local
npm run dev
```

Then open `http://localhost:3000`.

## Useful scripts

Run these from the repo root:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test:e2e
```

These commands target the `web` workspace.

For the GPS dashboard:

```bash
npm run start:gps-dashboard
```

The Pi runtime serves a slim local dashboard and syncs live telemetry to Herm. See
`gps-dashboard/README.md` for device env vars and local plate batching.

## Project layout

```text
.
├── gps-dashboard/  # GPS dashboard
├── web/            # Herm website
└── package.json
```

## Environment

Create `web/.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

For local Pi testing, point the Pi runtime at your local or tunneled Herm base URL via
`HERM_API_BASE_URL`. Production Pi installs should target `https://hermai.xyz`.

Do not commit secrets.
