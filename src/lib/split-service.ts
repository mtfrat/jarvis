import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import {
  SplitMeeting,
  SplitMember,
  SplitExpense,
  SplitBalance,
  SplitTransfer,
  Currency,
} from './types';

// ---------- Lógica pura (enteros en centavos, sin floats) ----------

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Divide totalCents en n partes iguales; el resto de centavos va a los primeros. */
export function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error('splitCents: n debe ser > 0');
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}

/**
 * Saldo por persona: cada gasto se divide en partes iguales entre todos los miembros.
 * net = paid - owed (> 0 le deben, < 0 debe).
 */
export function computeBalances(
  members: Array<{ id: string; name: string }>,
  expenses: Array<{ amount: number; paid_by: string }>
): SplitBalance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const m of members) {
    paid.set(m.id, 0);
    owed.set(m.id, 0);
  }

  for (const e of expenses) {
    const totalCents = toCents(Number(e.amount));
    const shares = splitCents(totalCents, members.length);
    members.forEach((m, i) => {
      owed.set(m.id, (owed.get(m.id) ?? 0) + shares[i]);
    });
    paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + totalCents);
  }

  return members.map((m) => {
    const p = paid.get(m.id) ?? 0;
    const o = owed.get(m.id) ?? 0;
    return { member_id: m.id, name: m.name, paid: p, owed: o, net: p - o };
  });
}

/**
 * Simplificación de deudas: empareja deudores con acreedores (mayor saldo primero)
 * para minimizar la cantidad de transfers. Devuelve "from le debe amount a to".
 */
export function simplifyDebts(balances: SplitBalance[]): SplitTransfer[] {
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.member_id, name: b.name, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.member_id, name: b.name, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SplitTransfer[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].amount, creditors[ci].amount);
    if (amount > 0) {
      transfers.push({
        from_id: debtors[di].id,
        from_name: debtors[di].name,
        to_id: creditors[ci].id,
        to_name: creditors[ci].name,
        amount,
      });
    }
    debtors[di].amount -= amount;
    creditors[ci].amount -= amount;
    if (debtors[di].amount === 0) di++;
    if (creditors[ci].amount === 0) ci++;
  }
  return transfers;
}

// ---------- CRUD ----------

function requireDb(): void {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no configurado — completá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  }
}

export interface SplitMeetingSummary extends SplitMeeting {
  total: number; // en centavos
  member_count: number;
  expense_count: number;
}

export interface SplitMeetingDetail {
  meeting: SplitMeeting;
  members: SplitMember[];
  expenses: Array<SplitExpense & { paid_by_name: string }>;
  balances: SplitBalance[];
  transfers: SplitTransfer[];
  total: number; // en centavos
}

export async function listSplitMeetings(): Promise<SplitMeetingSummary[]> {
  requireDb();

  const { data: meetings, error } = await supabaseAdmin
    .from('split_meetings')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw new Error(`No pude listar las reuniones: ${error.message}`);
  if (!meetings || meetings.length === 0) return [];

  const ids = meetings.map((m) => m.id);
  const [membersRes, expensesRes] = await Promise.all([
    supabaseAdmin.from('split_members').select('id, meeting_id').in('meeting_id', ids),
    supabaseAdmin.from('split_expenses').select('id, meeting_id, amount').in('meeting_id', ids),
  ]);
  if (membersRes.error) throw new Error(`No pude listar los participantes: ${membersRes.error.message}`);
  if (expensesRes.error) throw new Error(`No pude listar los gastos: ${expensesRes.error.message}`);

  const memberCount = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCount.set(m.meeting_id, (memberCount.get(m.meeting_id) ?? 0) + 1);
  }
  const expenseCount = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const e of expensesRes.data ?? []) {
    expenseCount.set(e.meeting_id, (expenseCount.get(e.meeting_id) ?? 0) + 1);
    totals.set(e.meeting_id, (totals.get(e.meeting_id) ?? 0) + toCents(Number(e.amount)));
  }

  return meetings.map((m) => ({
    ...m,
    total: totals.get(m.id) ?? 0,
    member_count: memberCount.get(m.id) ?? 0,
    expense_count: expenseCount.get(m.id) ?? 0,
  }));
}

export async function createSplitMeeting(params: {
  name: string;
  date?: string;
  currency?: Currency;
  members: string[];
}): Promise<SplitMeeting> {
  requireDb();

  const name = params.name.trim();
  if (!name) throw new Error('La reunión necesita un nombre.');
  const memberNames = params.members.map((n) => n.trim()).filter(Boolean);
  if (memberNames.length < 2) throw new Error('Hacen falta al menos 2 participantes.');
  const unique = new Set(memberNames.map((n) => n.toLowerCase()));
  if (unique.size !== memberNames.length) throw new Error('Los nombres deben ser únicos.');
  if (!params.date || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    throw new Error('Fecha inválida (YYYY-MM-DD).');
  }
  const currency = params.currency === 'USD' ? 'USD' : 'ARS';

  const { data: meeting, error } = await supabaseAdmin
    .from('split_meetings')
    .insert({ name, date: params.date, currency })
    .select()
    .single();
  if (error) throw new Error(`No pude crear la reunión: ${error.message}`);

  const rows = memberNames.map((n, i) => ({ meeting_id: meeting.id, name: n, position: i }));
  const { error: membersError } = await supabaseAdmin.from('split_members').insert(rows);
  if (membersError) {
    await supabaseAdmin.from('split_meetings').delete().eq('id', meeting.id);
    throw new Error(`No pude crear los participantes: ${membersError.message}`);
  }
  return meeting as SplitMeeting;
}

export async function getSplitMeeting(id: string): Promise<SplitMeetingDetail | null> {
  requireDb();

  const { data: meeting, error } = await supabaseAdmin
    .from('split_meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`No pude leer la reunión: ${error.message}`);
  if (!meeting) return null;

  const [membersRes, expensesRes] = await Promise.all([
    supabaseAdmin.from('split_members').select('*').eq('meeting_id', id).order('position'),
    supabaseAdmin
      .from('split_expenses')
      .select('*')
      .eq('meeting_id', id)
      .order('created_at', { ascending: true }),
  ]);
  if (membersRes.error) throw new Error(`No pude leer los participantes: ${membersRes.error.message}`);
  if (expensesRes.error) throw new Error(`No pude leer los gastos: ${expensesRes.error.message}`);

  const members: SplitMember[] = membersRes.data ?? [];
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const expenses: Array<SplitExpense & { paid_by_name: string }> = (expensesRes.data ?? []).map((e) => ({
    ...e,
    amount: Number(e.amount),
    paid_by_name: nameById.get(e.paid_by) ?? '?',
  }));

  const balances = computeBalances(members, expenses);
  const transfers = simplifyDebts(balances);
  const total = expenses.reduce((sum, e) => sum + toCents(e.amount), 0);

  return { meeting: meeting as SplitMeeting, members, expenses, balances, transfers, total };
}

export async function deleteSplitMeeting(id: string): Promise<boolean> {
  requireDb();
  const { error } = await supabaseAdmin.from('split_meetings').delete().eq('id', id);
  if (error) throw new Error(`No pude eliminar la reunión: ${error.message}`);
  return true;
}

export async function addSplitExpense(params: {
  meeting_id: string;
  description: string;
  amount: number;
  paid_by: string;
  date?: string;
}): Promise<SplitExpense> {
  requireDb();

  const description = params.description.trim();
  if (!description) throw new Error('El gasto necesita una descripción.');
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(`Monto inválido: ${params.amount}`);
  }

  const { data: payer, error: payerError } = await supabaseAdmin
    .from('split_members')
    .select('id, meeting_id')
    .eq('id', params.paid_by)
    .maybeSingle();
  if (payerError) throw new Error(`No pude verificar quién pagó: ${payerError.message}`);
  if (!payer || payer.meeting_id !== params.meeting_id) {
    throw new Error('El pagador no pertenece a esta reunión.');
  }

  const { data, error } = await supabaseAdmin
    .from('split_expenses')
    .insert({
      meeting_id: params.meeting_id,
      description,
      amount: params.amount,
      paid_by: params.paid_by,
      date: params.date,
    })
    .select()
    .single();
  if (error) throw new Error(`No pude agregar el gasto: ${error.message}`);
  return { ...data, amount: Number(data.amount) } as SplitExpense;
}

export async function deleteSplitExpense(id: string): Promise<boolean> {
  requireDb();
  const { error } = await supabaseAdmin.from('split_expenses').delete().eq('id', id);
  if (error) throw new Error(`No pude eliminar el gasto: ${error.message}`);
  return true;
}

export async function markMemberAddedToJarvis(memberId: string): Promise<void> {
  requireDb();
  const { error } = await supabaseAdmin
    .from('split_members')
    .update({ added_to_jarvis: true })
    .eq('id', memberId);
  if (error) throw new Error(`No pude marcar el participante: ${error.message}`);
}
