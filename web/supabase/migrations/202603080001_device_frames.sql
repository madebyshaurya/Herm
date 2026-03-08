-- Store latest camera frame per device per role for remote viewing
-- Only keeps the most recent frame (upsert), not history

create table if not exists public.device_frames (
  device_id  uuid not null references public.devices(id) on delete cascade,
  role       text not null default 'usb-0',
  camera_name text,
  frame_base64 text not null,
  updated_at timestamptz not null default now(),
  primary key (device_id, role)
);

alter table public.device_frames enable row level security;

create policy "device_frames_owner_read"
  on public.device_frames for select
  using (
    device_id in (
      select id from public.devices where owner_id = auth.uid()
    )
  );

-- Service role can upsert (used by device heartbeat API)
create policy "device_frames_service_all"
  on public.device_frames for all
  using (true)
  with check (true);
