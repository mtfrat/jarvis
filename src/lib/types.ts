export type Currency = 'ARS' | 'USD';

export const EXPENSE_CATEGORIES = [
  'Supermercado',
  'Salidas y Comida',
  'Transporte',
  'Servicios',
  'Salud',
  'Hogar',
  'Entretenimiento',
  'Educación',
  'Indumentaria',
  'Otros',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const PAYMENT_METHODS = [
  'Efectivo',
  'Tarjeta Débito',
  'Tarjeta Crédito',
  'Mercado Pago',
  'Transferencia',
  'Otro',
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface Expense {
  id: string;
  created_at: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: Currency;
  amount_ars: number;
  exchange_rate: number | null;
  description: string;
  category: ExpenseCategory | string;
  payment_method: PaymentMethod | string;
  installments_total: number;
  installment_number: number;
  installment_group_id: string | null;
  user_telegram_id: number | null;
  user_name: string | null;
  source: 'telegram_text' | 'telegram_voice' | 'telegram_receipt' | 'dashboard_manual';
  raw_input: string | null;
  metadata?: Record<string, unknown>;
}

export interface AIExpenseExtraction {
  amount: number;
  currency: Currency;
  description: string;
  category: ExpenseCategory;
  payment_method: PaymentMethod;
  installments_total: number;
  date?: string; // YYYY-MM-DD
  roast_comment?: string;
  items?: Array<{ name: string; price?: number }>;
}

export interface DashboardStats {
  totalSpentArs: number;
  totalSpentUsd: number;
  previousMonthComparisonPercent: number | null;
  dailyAverageArs: number;
  pendingInstallmentsCount: number;
  pendingInstallmentsAmountArs: number;
  topCategory: { category: string; amountArs: number; percentage: number } | null;
  categoryBreakdown: Array<{ category: string; amountArs: number; count: number; percentage: number }>;
  dayOfWeekBreakdown: Array<{ dayName: string; dayIndex: number; amountArs: number; count: number }>;
  monthlyTimeline: Array<{ date: string; amountArs: number }>;
  futureInstallments: Array<{ month: string; amountArs: number; count: number }>;
}
