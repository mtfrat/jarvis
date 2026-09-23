import { supabaseAdmin, isSupabaseConfigured } from './supabase';
import { normalizeToArs, getUsdExchangeRate } from './currency';
import { Expense, DashboardStats, EXPENSE_CATEGORIES, PAYMENT_METHODS } from './types';
import { addMonths, format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, differenceInCalendarDays } from 'date-fns';

export interface CreateExpenseParams {
  amount: number;
  currency: 'ARS' | 'USD';
  description: string;
  category: string;
  payment_method?: string;
  installments_total?: number;
  date?: string; // YYYY-MM-DD
  discount_amount?: number;
  user_telegram_id?: number | null;
  user_name?: string | null;
  source?: 'telegram_text' | 'telegram_voice' | 'telegram_receipt' | 'dashboard_manual';
  raw_input?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createExpense(params: CreateExpenseParams): Promise<Expense[]> {
  // Validation: covers every caller (bot, API, scripts) at the root
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error(`Invalid amount: ${params.amount}`);
  }
  if (params.currency !== 'ARS' && params.currency !== 'USD') {
    throw new Error(`Invalid currency: ${params.currency}`);
  }
  if (!params.description?.trim()) {
    throw new Error('Missing description');
  }

  const installmentsTotal = Math.min(60, Math.max(1, Math.round(params.installments_total || 1)));
  const baseDate = params.date ? new Date(`${params.date}T12:00:00Z`) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error(`Invalid date: ${params.date}`);
  }

  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(params.category)
    ? params.category
    : 'Otros';
  const paymentMethod = params.payment_method && (PAYMENT_METHODS as readonly string[]).includes(params.payment_method)
    ? params.payment_method
    : installmentsTotal > 1 ? 'Tarjeta Crédito' : 'Otro';

  const { amountArs, exchangeRate } = await normalizeToArs(params.amount, params.currency);

  const discountAmount = params.discount_amount && params.discount_amount > 0
    ? Math.round(params.discount_amount * 100) / 100
    : 0;
  const discountArs = discountAmount > 0
    ? (params.currency === 'USD'
      ? Math.round(discountAmount * (exchangeRate || 0) * 100) / 100
      : discountAmount)
    : 0;

  const installmentGroupId = installmentsTotal > 1 ? crypto.randomUUID() : null;
  const recordsToInsert: Array<Record<string, unknown>> = [];

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const baseAmount = round2(params.amount / installmentsTotal);
  const baseAmountArs = round2(amountArs / installmentsTotal);
  const baseDiscount = round2(discountAmount / installmentsTotal);
  const baseDiscountArs = round2(discountArs / installmentsTotal);
  let allocatedAmount = 0;
  let allocatedArs = 0;
  let allocatedDiscount = 0;
  let allocatedDiscountArs = 0;

  for (let i = 1; i <= installmentsTotal; i++) {
    const installmentDate = addMonths(baseDate, i - 1);
    const dateFormatted = format(installmentDate, 'yyyy-MM-dd');
    const isLast = i === installmentsTotal;
    const installmentAmount = isLast ? round2(params.amount - allocatedAmount) : baseAmount;
    const installmentArs = isLast ? round2(amountArs - allocatedArs) : baseAmountArs;
    const installmentDiscount = isLast ? round2(discountAmount - allocatedDiscount) : baseDiscount;
    const installmentDiscountArs = isLast ? round2(discountArs - allocatedDiscountArs) : baseDiscountArs;
    allocatedAmount += installmentAmount;
    allocatedArs += installmentArs;
    allocatedDiscount += installmentDiscount;
    allocatedDiscountArs += installmentDiscountArs;

    const desc = installmentsTotal > 1
      ? `${params.description} (Cuota ${i}/${installmentsTotal})`
      : params.description;

    recordsToInsert.push({
      date: dateFormatted,
      amount: installmentAmount,
      currency: params.currency,
      amount_ars: installmentArs,
      discount_amount: installmentDiscount,
      discount_ars: installmentDiscountArs,
      exchange_rate: exchangeRate,
      description: desc,
      category,
      payment_method: paymentMethod,
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
    throw new Error('Supabase not configured: expense was not saved.');
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
}): Promise<Expense[]> {
  if (!isSupabaseConfigured) return [];

  let query = supabaseAdmin.from('expenses').select('*').order('date', { ascending: false });

  if (options?.month) {
    const [year, month] = options.month.split('-').map(Number);
    const start = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    query = query.gte('date', start).lte('date', end);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }

  return (data || []) as Expense[];
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabaseAdmin.from('expenses').delete().eq('id', id);
  return !error;
}

export async function deleteInstallmentGroup(groupId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabaseAdmin
    .from('expenses')
    .delete()
    .eq('installment_group_id', groupId);
  return !error;
}

export async function getExpenseByPrefix(prefix: string): Promise<Expense | null> {
  if (!isSupabaseConfigured) return null;
  const clean = (prefix || '').trim().toLowerCase();
  if (!clean) return null;

  // Full UUID → eq (LIKE no existe sobre tipo uuid en Postgres)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clean)) {
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', clean)
      .maybeSingle();
    if (error || !data) return null;
    return data as Expense;
  }

  // First segment (8 hex chars, como muestra /gastos) → range sobre uuid
  if (/^[0-9a-f]{8}$/.test(clean)) {
    const lower = `${clean}-0000-0000-0000-000000000000`;
    const upper = `${clean}-ffff-ffff-ffff-ffffffffffff`;
    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .gte('id', lower)
      .lte('id', upper)
      .limit(2);
    if (error || !data || data.length === 0) return null;
    if (data.length > 1) return null;
    return data[0] as Expense;
  }

  // Fallback: prefijos de otro largo → scan de ids
  const { data, error } = await supabaseAdmin.from('expenses').select('id').limit(10000);
  if (error || !data) return null;
  const matches = data.filter((r) => String(r.id).toLowerCase().startsWith(clean));
  if (matches.length !== 1) return null;
  const { data: full } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('id', matches[0].id)
    .maybeSingle();
  if (!full) return null;
  return full as Expense;
}

export interface UpdateExpenseFields {
  amount?: number;
  description?: string;
  category?: string;
  payment_method?: string;
  date?: string;
}

export async function updateExpense(id: string, fields: UpdateExpenseFields): Promise<Expense> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data: found, error: findError } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findError || !found) throw new Error('Gasto no encontrado');
  const exp = found as Expense;
  const groupId = exp.installment_group_id;
  const isGroup = Boolean(groupId);

  if (fields.amount !== undefined && isGroup) {
    throw new Error('No podés cambiar el monto de un gasto en cuotas — borralo con /borrar y recrealo.');
  }
  if (fields.date !== undefined && isGroup) {
    throw new Error('No podés cambiar la fecha de un gasto en cuotas — borralo con /borrar y recrealo.');
  }

  const patch: Record<string, unknown> = {};

  if (fields.amount !== undefined) {
    if (!Number.isFinite(fields.amount) || fields.amount <= 0) {
      throw new Error('Monto inválido: debe ser un número mayor a 0.');
    }
    const rounded = Math.round(fields.amount * 100) / 100;
    patch.amount = rounded;
    if (exp.currency === 'USD') {
      const rate = await getUsdExchangeRate();
      patch.amount_ars = Math.round(rounded * rate * 100) / 100;
      patch.exchange_rate = rate;
    } else {
      patch.amount_ars = rounded;
    }
  }

  if (fields.date !== undefined) {
    const d = fields.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(`${d}T12:00:00Z`).getTime())) {
      throw new Error('Fecha inválida: usá el formato YYYY-MM-DD.');
    }
    patch.date = d;
  }

  if (fields.description !== undefined) {
    const desc = fields.description.trim();
    if (!desc) throw new Error('La descripción no puede estar vacía.');
    if (isGroup) {
      const { data: groupRows } = await supabaseAdmin
        .from('expenses')
        .select('id, installment_number, installments_total')
        .eq('installment_group_id', groupId);
      for (const row of groupRows || []) {
        await supabaseAdmin
          .from('expenses')
          .update({ description: `${desc} (Cuota ${row.installment_number}/${row.installments_total})` })
          .eq('id', row.id);
      }
    } else {
      patch.description = desc;
    }
  }

  if (fields.category !== undefined) {
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(fields.category)) {
      throw new Error(`Categoría inválida. Opciones: ${EXPENSE_CATEGORIES.join(', ')}`);
    }
    patch.category = fields.category;
  }

  if (fields.payment_method !== undefined) {
    if (!(PAYMENT_METHODS as readonly string[]).includes(fields.payment_method)) {
      throw new Error(`Método de pago inválido. Opciones: ${PAYMENT_METHODS.join(', ')}`);
    }
    patch.payment_method = fields.payment_method;
  }

  if (Object.keys(patch).length > 0) {
    let query = supabaseAdmin.from('expenses').update(patch);
    query = isGroup ? query.eq('installment_group_id', groupId) : query.eq('id', id);
    const { error } = await query;
    if (error) throw new Error(`No pude actualizar el gasto: ${error.message}`);
  }

  const { data: updated } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return updated as Expense;
}

export async function setExpenseDiscount(id: string, discountAmount: number): Promise<Expense> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    throw new Error('Descuento inválido: debe ser un número mayor o igual a 0.');
  }
  const { data: found, error: findError } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findError || !found) throw new Error('Gasto no encontrado');
  const exp = found as Expense;
  if (exp.installments_total > 1) {
    throw new Error('No podés poner descuento manual en un gasto en cuotas.');
  }
  const rounded = Math.round(discountAmount * 100) / 100;
  const discountArs = exp.currency === 'USD'
    ? Math.round(rounded * (await getUsdExchangeRate()) * 100) / 100
    : rounded;
  const { error } = await supabaseAdmin
    .from('expenses')
    .update({ discount_amount: rounded, discount_ars: discountArs })
    .eq('id', id);
  if (error) throw new Error(`No pude guardar el descuento: ${error.message}`);
  const { data: updated } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return updated as Expense;
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

  const isCurrentMonth = format(targetDate, 'yyyy-MM') === format(now, 'yyyy-MM');

  if (!isSupabaseConfigured) {
    // Return empty stats structure when database is not connected yet
    return {
      totalSpentArs: 0,
      totalSpentUsd: 0,
      totalIncomeArs: 0,
      recurringIncomeArs: 0,
      balanceArs: 0,
      totalDiscountArs: 0,
      budgetsExceeded: [],
      exchangeRate: await getUsdExchangeRate(),
      isCurrentMonth,
      previousMonthComparisonPercent: null,
      dailyAverageArs: 0,
      projectedMonthTotalArs: null,
      streakDaysWithoutSpending: null,
      installmentsMonthCount: 0,
      installmentsMonthAmountArs: 0,
      futureInstallmentsTotalArs: 0,
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
      subscriptions: [],
    };
  }

  // 1. Fetch current month expenses
  const { data: currentMonthData } = await supabaseAdmin
    .from('expenses')
    .select('*')
    .gte('date', currentMonthStart)
    .lte('date', currentMonthEnd);

  const currentExpenses: Expense[] = currentMonthData || [];

  // 2. Fetch previous month (for comparison and per-category deltas)
  const { data: prevMonthData } = await supabaseAdmin
    .from('expenses')
    .select('date, category, amount_ars')
    .gte('date', prevMonthStart)
    .lte('date', prevMonthEnd);

  const prevExpenses = prevMonthData || [];
  const prevMonthTotalArs = prevExpenses.reduce((sum, e) => sum + Number(e.amount_ars), 0);

  // 3. Totals
  const totalSpentArs = currentExpenses.reduce((sum, e) => sum + Number(e.amount_ars), 0);
  const totalDiscountArs = currentExpenses.reduce((sum, e) => sum + Number(e.discount_ars || 0), 0);
  const currentRate = await getUsdExchangeRate();
  const totalSpentUsd = Math.round((totalSpentArs / currentRate) * 100) / 100;

  // Incomes and balance for the selected month (manual + recurring templates)
  const { data: incomeRows } = await supabaseAdmin
    .from('incomes')
    .select('amount_ars')
    .gte('date', currentMonthStart)
    .lte('date', currentMonthEnd);
  const manualIncomeArs = (incomeRows || []).reduce((sum, r) => sum + Number(r.amount_ars), 0);

  const { data: recurringRows } = await supabaseAdmin
    .from('recurring_incomes')
    .select('amount, currency, created_at');
  const monthKey = format(targetDate, 'yyyy-MM');
  const recurringIncomeArs = (recurringRows || [])
    .filter((r) => monthKey >= String(r.created_at).slice(0, 7))
    .reduce((sum, r) => {
      const amount = Number(r.amount);
      return sum + (r.currency === 'USD' ? amount * currentRate : amount);
    }, 0);

  const totalIncomeArs = manualIncomeArs + recurringIncomeArs;
  const balanceArs = totalIncomeArs - totalSpentArs;

  // Comparison %: current month compares same-day-to-date (fair pace); past months compare full totals
  let previousMonthComparisonPercent: number | null = null;
  if (isCurrentMonth) {
    const prevDaysInMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
    const cutoffDay = Math.min(now.getDate(), prevDaysInMonth);
    const prevToDate = prevExpenses.reduce((sum, e) => {
      const day = Number(String(e.date).slice(8, 10));
      return day <= cutoffDay ? sum + Number(e.amount_ars) : sum;
    }, 0);
    const currentToDate = currentExpenses.reduce((sum, e) => {
      const day = Number(String(e.date).slice(8, 10));
      return day <= now.getDate() ? sum + Number(e.amount_ars) : sum;
    }, 0);
    if (prevToDate > 0) {
      previousMonthComparisonPercent = Math.round(((currentToDate - prevToDate) / prevToDate) * 100);
    }
  } else if (prevMonthTotalArs > 0) {
    previousMonthComparisonPercent = Math.round(((totalSpentArs - prevMonthTotalArs) / prevMonthTotalArs) * 100);
  }

  // Daily pace: elapsed days for the current month, full month otherwise
  const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const elapsedDays = isCurrentMonth ? now.getDate() : targetDate > now ? 0 : daysInMonth;
  const dailyAverageArs = elapsedDays > 0 ? Math.round(totalSpentArs / elapsedDays) : 0;

  // Projection: burn rate scaled to the end of the month (current month only)
  const projectedMonthTotalArs =
    isCurrentMonth && totalSpentArs > 0 && now.getDate() > 0
      ? Math.round((totalSpentArs / now.getDate()) * daysInMonth)
      : null;

  // Streak: consecutive days (ending today) with no expenses
  const todayStr = format(now, 'yyyy-MM-dd');
  const { data: todayRows } = await supabaseAdmin
    .from('expenses')
    .select('id')
    .eq('date', todayStr)
    .limit(1);
  let streakDaysWithoutSpending: number | null = null;
  if (todayRows && todayRows.length > 0) {
    streakDaysWithoutSpending = 0;
  } else {
    const { data: lastRows } = await supabaseAdmin
      .from('expenses')
      .select('date')
      .lt('date', todayStr)
      .order('date', { ascending: false })
      .limit(1);
    if (lastRows && lastRows.length > 0) {
      const [ly, lm, ld] = String(lastRows[0].date).split('-').map(Number);
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      streakDaysWithoutSpending = differenceInCalendarDays(todayLocal, new Date(ly, lm - 1, ld));
    }
  }

  // 4. Categories breakdown (with delta vs previous month)
  const prevCatMap = new Map<string, number>();
  prevExpenses.forEach((e) => {
    const c = String(e.category || 'Otros');
    prevCatMap.set(c, (prevCatMap.get(c) || 0) + Number(e.amount_ars));
  });

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
    .map(([category, stats]) => {
      const prevAmount = prevCatMap.get(category) || 0;
      return {
        category,
        amountArs: stats.amountArs,
        count: stats.count,
        percentage: totalSpentArs > 0 ? Math.round((stats.amountArs / totalSpentArs) * 100) : 0,
        deltaPercent:
          prevAmount > 0 ? Math.round(((stats.amountArs - prevAmount) / prevAmount) * 100) : null,
      };
    })
    .sort((a, b) => b.amountArs - a.amountArs);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  // Budgets exceeded for this month
  const { data: budgetRows } = await supabaseAdmin
    .from('budgets')
    .select('category, monthly_amount');
  const spentByCat = new Map(categoryBreakdown.map((c) => [c.category, c.amountArs]));
  const budgetsExceeded = (budgetRows || [])
    .filter((b) => (spentByCat.get(b.category) || 0) > Number(b.monthly_amount))
    .map((b) => b.category);

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

  const futureInstallmentsTotalArs = futureInstallments.reduce((sum, f) => sum + f.amountArs, 0);

  const installmentsMonthCount = currentExpenses.filter(e => e.installments_total > 1).length;
  const installmentsMonthAmountArs = currentExpenses
    .filter(e => e.installments_total > 1)
    .reduce((sum, e) => sum + Number(e.amount_ars), 0);

  // 8. Recurring subscriptions: same description in >=3 distinct months with stable amount (last 6 months)
  const subsStart = format(subMonths(now, 5), 'yyyy-MM-01');
  const { data: recentRows } = await supabaseAdmin
    .from('expenses')
    .select('date, description, amount_ars, installments_total')
    .gte('date', subsStart)
    .lte('date', todayStr);

  const subGroups = new Map<
    string,
    { desc: string; amounts: number[]; months: Set<string>; lastDate: string }
  >();
  (recentRows || []).forEach((r) => {
    if (Number(r.installments_total) > 1) return; // installment rows are not subscriptions
    const desc = String(r.description || '').trim().replace(/\s+/g, ' ');
    const key = desc.toLowerCase();
    if (!key) return;
    const g =
      subGroups.get(key) ||
      ({ desc, amounts: [], months: new Set<string>(), lastDate: '' } as {
        desc: string;
        amounts: number[];
        months: Set<string>;
        lastDate: string;
      });
    g.amounts.push(Number(r.amount_ars));
    g.months.add(String(r.date).slice(0, 7));
    if (String(r.date) > g.lastDate) g.lastDate = String(r.date);
    subGroups.set(key, g);
  });

  const subscriptions = Array.from(subGroups.values())
    .filter((g) => g.months.size >= 3 && g.amounts.length >= 3)
    .map((g) => {
      const avg = g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length;
      const min = Math.min(...g.amounts);
      const max = Math.max(...g.amounts);
      const stable = avg > 0 && (max - min) / avg <= 0.1;
      return {
        description: g.desc,
        amountArs: Math.round(avg),
        months: g.months.size,
        lastDate: g.lastDate,
        stable,
      };
    })
    .filter((g) => g.stable)
    .map(({ stable: _stable, ...rest }) => rest)
    .sort((a, b) => b.amountArs - a.amountArs)
    .slice(0, 10);

  return {
    totalSpentArs,
    totalSpentUsd,
    totalIncomeArs,
    recurringIncomeArs,
    balanceArs,
    totalDiscountArs,
    budgetsExceeded,
    exchangeRate: currentRate,
    isCurrentMonth,
    previousMonthComparisonPercent,
    dailyAverageArs,
    projectedMonthTotalArs,
    streakDaysWithoutSpending,
    installmentsMonthCount,
    installmentsMonthAmountArs,
    futureInstallmentsTotalArs,
    topCategory,
    categoryBreakdown,
    dayOfWeekBreakdown: orderedDays,
    monthlyTimeline,
    futureInstallments,
    subscriptions,
  };
}
