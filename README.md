# Herm

Herm is the web portal for a crowdsourced stolen-vehicle detection network and Raspberry Pi dashcam modules.

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

## Database

Apply the SQL in `supabase/migrations/202603070001_herm_portal.sql` to your Supabase project.

If you use magic-link auth locally, add `http://localhost:3000/auth/callback` to the Supabase Auth redirect URLs.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```
