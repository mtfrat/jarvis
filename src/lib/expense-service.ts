import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { normalizeToArs, getUsdExchangeRate } from './currency';
import { Expense, DashboardStats } from './types';
import { addMonths, format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';

export interface CreateExpenseParams {
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  category: string;
  payment_method?: string;
  installments_total?: number;
  date?: string; // YYYY-MM-DD
  user_telegram_id?: number | null;
  user_name?: string | null;
  source?: 'telegram_text' | 'telegram_voice' | 'telegram_receipt' | 'dashboard_manual';
  raw_input?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createExpense(params: CreateExpenseParams): Promise<Expense[]> {
  const installmentsTotal = Math.max(1, params.installments_total || 1);
  const baseDate = params.date ? new Date(`${params.date}T12:00:00Z`) : new Date();
  const { amountArs, exchangeRate } = await normalizeToArs(params.amount, params.currency);

  const installmentGroupId = installmentsTotal > 1 ? crypto.randomUUID() : null;
  const recordsToInsert: Array<Record<string, unknown>> = [];

  const perInstallmentAmount = Math.round((params.amount / installmentsTotal) * 100) / 100;
  const perInstallmentArs = Math.round((amountArs / installmentsTotal) * 100) / 100;

  for (let i = 1; i <= installmentsTotal; i++) {
    const installmentDate = addMonths(baseDate, i - 1);
    const dateFormatted = format(installmentDate, 'yyyy-MM-dd');

    const desc = installmentsTotal > 1
      ? `${params.description} (Cuota ${i}/${installmentsTotal})`
      : params.description;

    recordsToInsert.push({
      date: dateFormatted,
      amount: perInstallmentAmount,
      currency: params.currency,
      amount_ars: perInstallmentArs,
      exchange_rate: exchangeRate,
      description: desc,
      category: params.category,
      payment_method: params.payment_method || (installmentsTotal > 1 ? 'Tarjeta Crédito' : 'Otro'),
      installments_total: installmentsTotal,
      installment_number: i,
      installment_group_id: installmentGroupId,
      user_telegram_id: params.user_telegram_id || null,
      user_name: params.user_name || null,
      source: params.source || 'dashboard_manual',
      raw_input: params.raw_input || null,
      metadata: params.metadata || {},
    });
  }

  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured. Returning simulated created expense.');
    return recordsToInsert.map((rec, idx) => ({
      ...rec,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    })) as unknown as Expense[];
  }

  const { data, error } = await supabaseAdmin
    .from('expenses')
    .insert(recordsToInsert)
    .select();

  if (error) {
    console.error('Error inserting expense into Supabase:', error);
    throw new Error(`Failed to save expense: ${error.message}`);
  }

  return (data || []) as Expense[];
}

export async function getExpenses(options?: {
  month?: string; // YYYY-MM
  category?: string;
  search?: string;
  limit?: number;
}): Promise<Expense[]> {
  if (!isSupabaseConfigured) return [];

  let query = supabaseAdmin.from('expenses').select('*').order('date', { ascending: false });

  if (options?.month) {
    const [year, month] = options.month.split('-').map(Number);
    const start = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    query = query.gte('date', start).lte('date', end);
  }

  if (options?.category && options.category !== 'all') {
    query = query.eq('category', options.category);
  }

  if (options?.search) {
    query = query.ilike('description', `%${options.search}%`);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }

  return (data || []) as Expense[];
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabaseAdmin.from('expenses').delete().eq('id', id);
  return !error;
}

export async function getDashboardStats(selectedMonth?: string): Promise<DashboardStats> {
  const now = new Date();
  const targetDate = selectedMonth
    ? new Date(`${selectedMonth}-01T12:00:00Z`)
    : now;

  const currentMonthStart = format(startOfMonth(targetDate), 'yyyy-MM-dd');
  const currentMonthEnd = format(endOfMonth(targetDate), 'yyyy-MM-dd');

  const prevMonthDate = subMonths(targetDate, 1);
  const prevMonthStart = format(startOfMonth(prevMonthDate), 'yyyy-MM-dd');
  const prevMonthEnd = format(endOfMonth(prevMonthDate), 'yyyy-MM-dd');

  if (!isSupabaseConfigured) {
    // Return empty stats structure when database is not connected yet
    return {
      totalSpentArs: 0,
      totalSpentUsd: 0,
      previousMonthComparisonPercent: null,
      dailyAverageArs: 0,
      pendingInstallmentsCount: 0,
      pendingInstallmentsAmountArs: 0,
      topCategory: null,
      categoryBreakdown: [],
      dayOfWeekBreakdown: [
        { dayName: 'Lunes', dayIndex: 1, amountArs: 0, count: 0 },
        { dayName: 'Martes', dayIndex: 2, amountArs: 0, count: 0 },
        { dayName: 'Miércoles', dayIndex: 3, amountArs: 0, count: 0 },
        { dayName: 'Jueves', dayIndex: 4, amountArs: 0, count: 0 },
        { dayName: 'Viernes', dayIndex: 5, amountArs: 0, count: 0 },
        { dayName: 'Sábado', dayIndex: 6, amountArs: 0, count: 0 },
        { dayName: 'Domingo', dayIndex: 0, amountArs: 0, count: 0 },
      ],
      monthlyTimeline: [],
      futureInstallments: [],
    };
  }

  // 1. Fetch current month expenses
  const { data: currentMonthData } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .gte('date', currentMonthStart)
    .lte('date', currentMonthEnd);

  const currentExpenses: Expense[] = currentMonthData || [];

  // 2. Fetch previous month total for comparison
  const { data: prevMonthData } = await supabaseAdmin
    .from('expenses')
    .select('amount_ars')
    .gte('date', prevMonthStart)
    .lte('date', prevMonthEnd);

  const prevExpenses = prevMonthData || [];
  const prevMonthTotalArs = prevExpenses.reduce((sum, e) => sum + Number(e.amount_ars), 0);

  // 3. Totals
  const totalSpentArs = currentExpenses.reduce((sum, e) => sum + Number(e.amount_ars), 0);
  const currentRate = await getUsdExchangeRate();
  const totalSpentUsd = Math.round((totalSpentArs / currentRate) * 100) / 100;

  // Comparison %
  let previousMonthComparisonPercent: number | null = null;
  if (prevMonthTotalArs > 0) {
    previousMonthComparisonPercent = Math.round(((totalSpentArs - prevMonthTotalArs) / prevMonthTotalArs) * 100);
  }

  // Daily average for current month
  const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const dailyAverageArs = Math.round(totalSpentArs / daysInMonth);

  // 4. Categories breakdown
  const categoryMap = new Map<string, { amountArs: number; count: number }>();
  currentExpenses.forEach((exp) => {
    const cat = exp.category || 'Otros';
    const existing = categoryMap.get(cat) || { amountArs: 0, count: 0 };
    categoryMap.set(cat, {
      amountArs: existing.amountArs + Number(exp.amount_ars),
      count: existing.count + 1,
    });
  });

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      amountArs: stats.amountArs,
      count: stats.count,
      percentage: totalSpentArs > 0 ? Math.round((stats.amountArs / totalSpentArs) * 100) : 0,
    }))
    .sort((a, b) => b.amountArs - a.amountArs);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  // 5. Day of week analysis (0=Sunday, 1=Monday... 6=Saturday)
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayTotals = dayNames.map((name, idx) => ({
    dayName: name,
    dayIndex: idx,
    amountArs: 0,
    count: 0,
  }));

  currentExpenses.forEach((exp) => {
    const d = new Date(`${exp.date}T12:00:00Z`);
    const dayIdx = d.getDay();
    dayTotals[dayIdx].amountArs += Number(exp.amount_ars);
    dayTotals[dayIdx].count += 1;
  });

  // Reorder to start with Lunes (1..6, 0)
  const orderedDays = [...dayTotals.slice(1), dayTotals[0]];

  // 6. Monthly timeline (Daily spending)
  const daysInterval = eachDayOfInterval({
    start: startOfMonth(targetDate),
    end: endOfMonth(targetDate),
  });

  const dailyMap = new Map<string, number>();
  currentExpenses.forEach((exp) => {
    const curr = dailyMap.get(exp.date) || 0;
    dailyMap.set(exp.date, curr + Number(exp.amount_ars));
  });

  const monthlyTimeline = daysInterval.map((d) => {
    const formatted = format(d, 'yyyy-MM-dd');
    return {
      date: formatted,
      amountArs: dailyMap.get(formatted) || 0,
    };
  });

  // 7. Future installments query (projections for coming months)
  const futureStart = format(targetDate, 'yyyy-MM-01');
  const futureEnd = format(addMonths(targetDate, 6), 'yyyy-MM-dd');

  const { data: futureData } = await supabaseAdmin
    .from('expenses')
    .select('date, amount_ars, installments_total, installment_number')
    .gt('installments_total', 1)
    .gte('date', futureStart)
    .lte('date', futureEnd);

  const futureExpenses = futureData || [];
  const futureMonthsMap = new Map<string, { amountArs: number; count: number }>();

  futureExpenses.forEach((f) => {
    const monthKey = f.date.substring(0, 7); // YYYY-MM
    const curr = futureMonthsMap.get(monthKey) || { amountArs: 0, count: 0 };
    futureMonthsMap.set(monthKey, {
      amountArs: curr.amountArs + Number(f.amount_ars),
      count: curr.count + 1,
    });
  });

  const futureInstallments = Array.from(futureMonthsMap.entries())
    .map(([month, stats]) => ({
      month,
      amountArs: stats.amountArs,
      count: stats.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const pendingInstallmentsCount = currentExpenses.filter(e => e.installments_total > 1).length;
  const pendingInstallmentsAmountArs = currentExpenses
    .filter(e => e.installments_total > 1)
    .reduce((sum, e) => sum + Number(e.amount_ars), 0);

  return {
    totalSpentArs,
    totalSpentUsd,
    previousMonthComparisonPercent,
    dailyAverageArs,
    pendingInstallmentsCount,
    pendingInstallmentsAmountArs,
    topCategory,
    categoryBreakdown,
    dayOfWeekBreakdown: orderedDays,
    monthlyTimeline,
    futureInstallments,
  };
}
