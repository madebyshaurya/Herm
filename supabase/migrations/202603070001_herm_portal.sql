create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  city text,
  province text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plate_raw text not null,
  plate_normalized text not null,
  nickname text,
  make text,
  model text,
  color text,
  notes text,
  photo_path text,
  photo_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists vehicles_owner_plate_unique
  on public.vehicles (owner_id, plate_normalized);

create index if not exists vehicles_plate_normalized_idx
  on public.vehicles (plate_normalized);

create table if not exists public.stolen_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'recovered')),
  reported_at timestamptz not null default timezone('utc', now()),
  recovered_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists stolen_reports_single_active_per_vehicle
  on public.stolen_reports (vehicle_id)
  where status = 'active';

create or replace function public.ensure_stolen_report_owner_matches_vehicle()
returns trigger
language plpgsql
as $$
declare
  vehicle_owner uuid;
begin
  select owner_id into vehicle_owner
  from public.vehicles
  where id = new.vehicle_id;

  if vehicle_owner is null then
    raise exception 'Vehicle not found for stolen report';
  end if;

  if vehicle_owner <> new.owner_id then
    raise exception 'Stolen report owner must match vehicle owner';
  end if;

  return new;
end;
$$;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'provisioning' check (status in ('provisioning', 'online', 'offline')),
  firmware_version text,
  is_camera_online boolean not null default false,
  is_gps_online boolean not null default false,
  last_heartbeat_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.device_secrets (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  secret_hash text not null unique,
  label text,
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null,
  storage_path text not null unique,
  public_url text,
  mime_type text,
  bytes_size bigint,
  related_type text not null check (related_type in ('vehicle', 'plate_sighting', 'human_detection')),
  related_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plate_sightings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  matched_profile_id uuid references auth.users(id) on delete set null,
  matched_stolen_report_id uuid references public.stolen_reports(id) on delete set null,
  raw_plate text not null,
  normalized_plate text not null,
  confidence double precision,
  latitude double precision,
  longitude double precision,
  detected_at timestamptz not null default timezone('utc', now()),
  snapshot_media_id uuid references public.media_assets(id) on delete set null,
  snapshot_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists plate_sightings_detected_at_idx
  on public.plate_sightings (detected_at desc);

create table if not exists public.human_detection_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  confidence double precision,
  latitude double precision,
  longitude double precision,
  detected_at timestamptz not null default timezone('utc', now()),
  snapshot_media_id uuid references public.media_assets(id) on delete set null,
  snapshot_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists human_detection_events_detected_at_idx
  on public.human_detection_events (detected_at desc);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at
before update on public.vehicles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute procedure public.set_updated_at();

drop trigger if exists ensure_stolen_report_owner_matches_vehicle on public.stolen_reports;
create trigger ensure_stolen_report_owner_matches_vehicle
before insert or update on public.stolen_reports
for each row execute procedure public.ensure_stolen_report_owner_matches_vehicle();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.stolen_reports enable row level security;
alter table public.devices enable row level security;
alter table public.device_secrets enable row level security;
alter table public.media_assets enable row level security;
alter table public.plate_sightings enable row level security;
alter table public.human_detection_events enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id);

drop policy if exists "vehicles_owner_all" on public.vehicles;
create policy "vehicles_owner_all"
on public.vehicles for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "stolen_reports_owner_all" on public.stolen_reports;
create policy "stolen_reports_owner_all"
on public.stolen_reports for all
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.vehicles
    where vehicles.id = stolen_reports.vehicle_id
      and vehicles.owner_id = auth.uid()
  )
);

drop policy if exists "devices_owner_all" on public.devices;
create policy "devices_owner_all"
on public.devices for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "device_secrets_owner_select" on public.device_secrets;
create policy "device_secrets_owner_select"
on public.device_secrets for select
using (
  exists (
    select 1 from public.devices
    where devices.id = device_secrets.device_id
      and devices.owner_id = auth.uid()
  )
);

drop policy if exists "device_secrets_owner_modify" on public.device_secrets;
create policy "device_secrets_owner_modify"
on public.device_secrets for all
using (
  exists (
    select 1 from public.devices
    where devices.id = device_secrets.device_id
      and devices.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.devices
    where devices.id = device_secrets.device_id
      and devices.owner_id = auth.uid()
  )
);

drop policy if exists "media_assets_owner_all" on public.media_assets;
create policy "media_assets_owner_all"
on public.media_assets for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "plate_sightings_visible_to_owner_or_match" on public.plate_sightings;
create policy "plate_sightings_visible_to_owner_or_match"
on public.plate_sightings for select
using (auth.uid() = owner_id or auth.uid() = matched_profile_id);

drop policy if exists "human_detection_events_owner_select" on public.human_detection_events;
create policy "human_detection_events_owner_select"
on public.human_detection_events for select
using (auth.uid() = owner_id);

drop policy if exists "push_tokens_owner_all" on public.push_tokens;
create policy "push_tokens_owner_all"
on public.push_tokens for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('event-snapshots', 'event-snapshots', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('vehicle-media', 'vehicle-media', true)
on conflict (id) do nothing;

drop policy if exists "Public event snapshots are readable" on storage.objects;
create policy "Public event snapshots are readable"
on storage.objects for select
using (bucket_id = 'event-snapshots');

drop policy if exists "Public vehicle media is readable" on storage.objects;
create policy "Public vehicle media is readable"
on storage.objects for select
using (bucket_id = 'vehicle-media');
