import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { normalizeToArs } from './currency';
import { Income, RecurringIncome } from './types';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export interface CreateIncomeParams {
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  date?: string; // YYYY-MM-DD
}

export async function createIncome(params: CreateIncomeParams): Promise<Income> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(`Invalid amount: ${params.amount}`);
  }
  if (params.currency !== 'ARS' && params.currency !== 'USD') {
    throw new Error(`Invalid currency: ${params.currency}`);
  }
  if (!params.description?.trim()) {
    throw new Error('Missing description');
  }

  const baseDate = params.date ? new Date(`${params.date}T12:00:00Z`) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error(`Invalid date: ${params.date}`);
  }

  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured: income was not saved.');
  }

  const { amountArs, exchangeRate } = await normalizeToArs(params.amount, params.currency);

  const { data, error } = await supabaseAdmin
    .from('incomes')
    .insert({
      date: format(baseDate, 'yyyy-MM-dd'),
      amount: params.amount,
      currency: params.currency,
      amount_ars: amountArs,
      exchange_rate: exchangeRate,
      description: params.description.trim(),
      source: 'dashboard_manual',
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting income into Supabase:', error);
    throw new Error(`Failed to save income: ${error.message}`);
  }

  return data as Income;
}

export async function getIncomes(options?: { month?: string }): Promise<Income[]> {
  if (!isSupabaseConfigured) return [];

  let query = supabaseAdmin.from('incomes').select('*').order('date', { ascending: false });

  if (options?.month) {
    const [year, month] = options.month.split('-').map(Number);
    const start = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    query = query.gte('date', start).lte('date', end);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching incomes:', error);
    return [];
  }

  return (data || []) as Income[];
}

export async function deleteIncome(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabaseAdmin.from('incomes').delete().eq('id', id);
  return !error;
}

export async function getRecurringIncomes(): Promise<RecurringIncome[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabaseAdmin
    .from('recurring_incomes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching recurring incomes:', error);
    return [];
  }
  return (data || []) as RecurringIncome[];
}

export async function createRecurringIncome(params: {
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
}): Promise<RecurringIncome> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(`Invalid amount: ${params.amount}`);
  }
  if (params.currency !== 'ARS' && params.currency !== 'USD') {
    throw new Error(`Invalid currency: ${params.currency}`);
  }
  if (!params.description?.trim()) {
    throw new Error('Missing description');
  }
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured: recurring income was not saved.');
  }

  const { data, error } = await supabaseAdmin
    .from('recurring_incomes')
    .insert({
      description: params.description.trim(),
      amount: params.amount,
      currency: params.currency,
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting recurring income:', error);
    throw new Error(`Failed to save recurring income: ${error.message}`);
  }
  return data as RecurringIncome;
}

export async function deleteRecurringIncome(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabaseAdmin.from('recurring_incomes').delete().eq('id', id);
  return !error;
}
