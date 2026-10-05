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
  'Cuenta DNI',
  'Mercado Pago',
  'Transferencia',
  'Otro',
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface Expense {
  id: string;
  created_at: string;
  date: string; // YYYY-MM-DD (fecha de compra en BD)
  effective_date?: string; // fecha de figura en el dashboard (día de pago de tarjeta); solo en lectura
  amount: number;
  currency: Currency;
  amount_ars: number;
  discount_amount: number;
  discount_ars: number;
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
  reimbursable?: boolean;
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
  original_amount?: number;
  roast_comment?: string;
  items?: Array<{ name: string; price?: number }>;
}

export interface Income {
  id: string;
  created_at: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: Currency;
  amount_ars: number;
  exchange_rate: number | null;
  description: string;
  source: string;
}

export interface RecurringIncome {
  id: string;
  created_at: string;
  description: string;
  amount: number;
  currency: Currency;
}

export interface Budget {
  id: string;
  created_at: string;
  category: string;
  monthly_amount: number;
}

export interface SplitMeeting {
  id: string;
  created_at: string;
  name: string;
  date: string; // YYYY-MM-DD
  currency: Currency;
}

export interface SplitMember {
  id: string;
  meeting_id: string;
  name: string;
  position: number;
  added_to_jarvis: boolean;
}

export interface SplitExpense {
  id: string;
  created_at: string;
  meeting_id: string;
  description: string;
  amount: number;
  paid_by: string; // member id
  date: string; // YYYY-MM-DD
}

export interface SplitBalance {
  member_id: string;
  name: string;
  paid: number; // en centavos
  owed: number; // en centavos
  net: number; // paid - owed; > 0 le deben, < 0 debe
}

export interface SplitTransfer {
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  amount: number; // en centavos
}

export interface CardStatement {
  status: 'due' | 'accumulating';
  totalArs: number;
  periodStart: string; // YYYY-MM-DD (inicio del período, inclusive)
  periodEnd: string; // YYYY-MM-DD (cierre del período, inclusive)
  dueDate: string | null; // vencimiento del próximo pago (YYYY-MM-DD)
  closingDate: string; // día de cierre del período (YYYY-MM-DD)
}

export interface DashboardStats {
  totalSpentArs: number;
  totalSpentUsd: number;
  totalIncomeArs: number;
  recurringIncomeArs: number;
  balanceArs: number;
  totalDiscountArs: number;
  budgetsExceeded: string[];
  exchangeRate: number;
  isCurrentMonth: boolean;
  previousMonthComparisonPercent: number | null;
  dailyAverageArs: number;
  projectedMonthTotalArs: number | null;
  streakDaysWithoutSpending: number | null;
  installmentsMonthCount: number;
  installmentsMonthAmountArs: number;
  futureInstallmentsTotalArs: number;
  topCategory: { category: string; amountArs: number; percentage: number } | null;
  categoryBreakdown: Array<{
    category: string;
    amountArs: number;
    count: number;
    percentage: number;
    deltaPercent: number | null;
  }>;
  dayOfWeekBreakdown: Array<{ dayName: string; dayIndex: number; amountArs: number; count: number }>;
  monthlyTimeline: Array<{ date: string; amountArs: number }>;
  futureInstallments: Array<{ month: string; amountArs: number; count: number }>;
  subscriptions: Array<{ description: string; amountArs: number; months: number; lastDate: string }>;
  cardStatement: CardStatement | null;
}
