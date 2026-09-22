-- Jarvis Finance: Incomes table
-- Execute in Supabase SQL Editor -> New query -> Run

create table if not exists public.incomes (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    date date not null default current_date,
    amount numeric(14, 2) not null check (amount > 0),
    currency varchar(10) not null default 'ARS',
    amount_ars numeric(14, 2) not null,
    exchange_rate numeric(10, 2),
    description text not null,
    source varchar(30) not null default 'dashboard_manual'
);

create index if not exists idx_incomes_date on public.incomes(date desc);

alter table public.incomes enable row level security;

create policy "Full access for service_role"
on public.incomes
for all
to service_role
using (true)
with check (true);
