-- Remove unused tables and simplify schema
-- Drops: profiles, push_tokens, media_assets (all have zero or INSERT-only references)
-- Removes: snapshot_media_id FK columns from plate_sightings and human_detection_events

-- Drop FK columns that referenced media_assets
alter table public.plate_sightings drop column if exists snapshot_media_id;
alter table public.human_detection_events drop column if exists snapshot_media_id;

-- Drop RLS policies before dropping tables
drop policy if exists "media_assets_owner_all" on public.media_assets;
drop policy if exists "push_tokens_owner_all" on public.push_tokens;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

-- Drop triggers
drop trigger if exists set_profiles_updated_at on public.profiles;

-- Drop the handle_new_user trigger that inserts into profiles
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Drop unused tables
drop table if exists public.media_assets;
drop table if exists public.push_tokens;
drop table if exists public.profiles;
