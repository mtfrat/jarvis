-- Jarvis Finance: División de cuentas (split bills por reunión)
-- Execute in Supabase SQL Editor -> New query -> Run

create table if not exists public.split_meetings (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    name varchar(120) not null,
    date date not null default current_date,
    currency varchar(10) not null default 'ARS' check (currency in ('ARS', 'USD'))
);

create table if not exists public.split_members (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    meeting_id uuid not null references public.split_meetings(id) on delete cascade,
    name varchar(80) not null,
    position int not null default 0,
    added_to_jarvis boolean not null default false
);

create table if not exists public.split_expenses (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    meeting_id uuid not null references public.split_meetings(id) on delete cascade,
    description text not null,
    amount numeric(14, 2) not null check (amount > 0),
    paid_by uuid not null references public.split_members(id) on delete cascade,
    date date not null default current_date
);

create index if not exists idx_split_members_meeting on public.split_members(meeting_id);
create index if not exists idx_split_expenses_meeting on public.split_expenses(meeting_id);

alter table public.split_meetings enable row level security;
alter table public.split_members enable row level security;
alter table public.split_expenses enable row level security;

create policy "Full access for service_role"
on public.split_meetings
for all
to service_role
using (true)
with check (true);

create policy "Full access for service_role"
on public.split_members
for all
to service_role
using (true)
with check (true);

create policy "Full access for service_role"
on public.split_expenses
for all
to service_role
using (true)
with check (true);
