# Herm

Herm is organized as a small monorepo.

## Apps

- `web/`: Next.js web portal for the Herm dashboard and marketing site

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

## Project layout

```text
.
├── web/        # Herm website
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

Do not commit secrets.
