import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { Budget, EXPENSE_CATEGORIES } from './types';

export async function getBudgets(): Promise<Budget[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabaseAdmin
    .from('budgets')
    .select('*')
    .order('monthly_amount', { ascending: false });
  if (error) {
    console.error('Error fetching budgets:', error);
    return [];
  }
  return (data || []) as Budget[];
}

export async function upsertBudget(category: string, monthlyAmount: number): Promise<Budget> {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    throw new Error(`Invalid amount: ${monthlyAmount}`);
  }
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured: budget was not saved.');
  }

  const { data, error } = await supabaseAdmin
    .from('budgets')
    .upsert({ category, monthly_amount: monthlyAmount }, { onConflict: 'category' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting budget:', error);
    throw new Error(`Failed to save budget: ${error.message}`);
  }
  return data as Budget;
}

export async function deleteBudget(category: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabaseAdmin.from('budgets').delete().eq('category', category);
  return !error;
}
