-- Jarvis Finance: gastos 100% reintegrables (aparecen en el pago de la tarjeta, no en las estadísticas)
-- Execute in Supabase SQL Editor -> New query -> Run

alter table public.expenses
  add column if not exists reimbursable boolean not null default false;
