-- Jarvis Finance: Budgets + recurring income templates
-- Execute in Supabase SQL Editor -> New query -> Run

create table if not exists public.budgets (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    category varchar(50) not null unique,
    monthly_amount numeric(14, 2) not null check (monthly_amount > 0)
);

create table if not exists public.recurring_incomes (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    description text not null,
    amount numeric(14, 2) not null check (amount > 0),
    currency varchar(10) not null default 'ARS'
);

alter table public.budgets enable row level security;
alter table public.recurring_incomes enable row level security;

create policy "Full access for service_role"
on public.budgets
for all
to service_role
using (true)
with check (true);

create policy "Full access for service_role"
on public.recurring_incomes
for all
to service_role
using (true)
with check (true);
