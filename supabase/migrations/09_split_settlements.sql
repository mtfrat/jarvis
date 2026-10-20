-- Jarvis Finance: deudas saldadas en la división de cuentas (marcar quién ya pagó)
-- Execute in Supabase SQL Editor -> New query -> Run

create table if not exists public.split_settlements (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    meeting_id uuid not null references public.split_meetings(id) on delete cascade,
    from_member_id uuid not null references public.split_members(id) on delete cascade,
    to_member_id uuid not null references public.split_members(id) on delete cascade,
    amount_cents bigint not null check (amount_cents > 0),
    unique (meeting_id, from_member_id, to_member_id)
);

create index if not exists idx_split_settlements_meeting on public.split_settlements(meeting_id);

alter table public.split_settlements enable row level security;

create policy "Full access for service_role"
on public.split_settlements
for all
to service_role
using (true)
with check (true);
