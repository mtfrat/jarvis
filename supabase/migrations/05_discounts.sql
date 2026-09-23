-- Jarvis Finance: Discount tracking
-- Execute in Supabase SQL Editor -> New query -> Run

alter table public.expenses
    add column if not exists discount_amount numeric(14, 2) not null default 0,
    add column if not exists discount_ars numeric(14, 2) not null default 0;
