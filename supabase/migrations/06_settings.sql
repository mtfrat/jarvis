-- Jarvis Finance: settings (día de pago de tarjeta, chat de recordatorios)
-- Execute in Supabase SQL Editor -> New query -> Run

create table if not exists public.settings (
    key varchar(50) primary key,
    value text not null,
    updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "Full access for service_role"
on public.settings
for all
to service_role
using (true)
with check (true);
