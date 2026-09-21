-- Jarvis Finance: Initial Schema
-- Execute this script in your Supabase Project: SQL Editor -> New query -> Run

create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    date date not null default current_date,
    amount numeric(14, 2) not null,
    currency varchar(10) not null default 'ARS',
    amount_ars numeric(14, 2) not null,
    exchange_rate numeric(10, 2),
    description text not null,
    category varchar(50) not null,
    payment_method varchar(50) default 'Otro',
    installments_total integer not null default 1,
    installment_number integer not null default 1,
    installment_group_id uuid,
    user_telegram_id bigint,
    user_name text,
    source varchar(30) not null default 'manual',
    raw_input text,
    metadata jsonb default '{}'::jsonb
);

-- Indexes for performance
create index if not exists idx_expenses_date on public.expenses(date desc);
create index if not exists idx_expenses_category on public.expenses(category);
create index if not exists idx_expenses_user on public.expenses(user_telegram_id);
create index if not exists idx_expenses_installment_group on public.expenses(installment_group_id);

-- Enable Row Level Security (RLS)
alter table public.expenses enable row level security;

-- Permissive policy for read/write with anon and service_role keys
create policy "Allow all operations for anon and service_role"
on public.expenses
for all
to anon, authenticated, service_role
using (true)
with check (true);
