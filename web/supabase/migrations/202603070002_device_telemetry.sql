create table if not exists public.device_telemetry_samples (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  captured_at timestamptz not null default timezone('utc', now()),
  firmware_version text,
  serial_connected boolean not null default false,
  serial_path text,
  serial_error text,
  fix boolean not null default false,
  fix_quality integer not null default 0,
  fix_mode integer not null default 1,
  status_text text not null default 'SEARCHING',
  latitude double precision,
  longitude double precision,
  altitude_m double precision,
  speed_kmh double precision,
  heading_deg double precision,
  hdop double precision,
  vdop double precision,
  pdop double precision,
  satellites_in_use integer not null default 0,
  satellites_in_view integer not null default 0,
  satellites jsonb not null default '[]'::jsonb,
  system_cpu_percent double precision,
  system_ram_used_mb integer,
  system_ram_total_mb integer,
  system_temp_c double precision,
  system_ip text,
  system_uptime_sec integer,
  system_internet boolean not null default false,
  source text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_telemetry_samples_device_captured_idx
  on public.device_telemetry_samples (device_id, captured_at desc);

create index if not exists device_telemetry_samples_owner_captured_idx
  on public.device_telemetry_samples (owner_id, captured_at desc);

create or replace function public.prune_device_telemetry_samples(
  target_device_id uuid,
  keep_count integer default 720
)
returns void
language sql
as $$
  delete from public.device_telemetry_samples
  where id in (
    select id
    from public.device_telemetry_samples
    where device_id = target_device_id
    order by captured_at desc, created_at desc
    offset greatest(keep_count, 0)
  );
$$;

alter table public.device_telemetry_samples enable row level security;

drop policy if exists "device_telemetry_owner_select" on public.device_telemetry_samples;
create policy "device_telemetry_owner_select"
on public.device_telemetry_samples for select
using (auth.uid() = owner_id);
