-- Fix: 01_initial_schema.sql granted full access to anon (RLS was a no-op).
-- Run this on existing databases. Revokes anon/authenticated; only service_role remains.

drop policy if exists "Allow all operations for anon and service_role" on public.expenses;

drop policy if exists "Full access for service_role" on public.expenses;
create policy "Full access for service_role"
on public.expenses
for all
to service_role
using (true)
with check (true);
