'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { KpiCards } from '@/components/KpiCards';
import { ChartsSection } from '@/components/ChartsSection';
import { ExpensesTable } from '@/components/ExpensesTable';
import { NewExpenseModal } from '@/components/NewExpenseModal';
import { NewIncomeModal } from '@/components/NewIncomeModal';
import { BudgetPanel } from '@/components/BudgetPanel';
import { DashboardStats, Expense } from '@/lib/types';
import { AlertCircle, RefreshCw, Terminal, ExternalLink } from 'lucide-react';
import { dashboardHeaders } from '@/lib/api-client';

export default function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  });
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [exchangeRate, setExchangeRate] = useState<number>(1200);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch stats and expenses in parallel
      const [statsRes, expRes] = await Promise.all([
        fetch(`/api/stats?month=${selectedMonth}`, { headers: dashboardHeaders }),
        fetch(`/api/expenses?month=${selectedMonth}`, { headers: dashboardHeaders }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
        if (statsData.exchangeRate) {
          setExchangeRate(statsData.exchangeRate);
        }
      }

      if (expRes.ok) {
        const expData = await expRes.json();
        setExpenses(expData);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteExpense = async (item: Expense) => {
    const msg = item.installment_group_id
      ? `Este gasto tiene ${item.installments_total} cuotas. Se eliminarán TODAS las cuotas de "${item.description}". ¿Continuar?`
      : '¿Estás seguro de que deseas eliminar este gasto?';
    if (!confirm(msg)) return;
    try {
      const params = item.installment_group_id
        ? `group_id=${item.installment_group_id}`
        : `id=${item.id}`;
      const res = await fetch(`/api/expenses?${params}`, {
        method: 'DELETE',
        headers: dashboardHeaders,
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('No se pudo eliminar el gasto.');
      }
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col">
      <Header
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        currency={currency}
        onCurrencyToggle={() => setCurrency((prev) => (prev === 'ARS' ? 'USD' : 'ARS'))}
        onOpenNewExpense={() => setIsModalOpen(true)}
        onOpenNewIncome={() => setIsIncomeModalOpen(true)}
        exchangeRate={exchangeRate}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Quick Instructions & Dev Status */}
        {expenses.length === 0 && !loading && (
          <div className="bg-[#121215] border border-emerald-500/20 rounded-xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="space-y-2 flex-1">
                <h2 className="text-sm font-semibold text-white">¡Jarvis Finance está listo para comenzar!</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Para ver tus primeros datos en tiempo real, puedes:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="bg-[#18181b] p-3 rounded-lg border border-[#27272a] text-xs">
                    <span className="font-semibold text-emerald-400 block mb-1">1. Bot de Telegram</span>
                    Mandá un audio, ticket o mensaje (ej: <i>"Supermercado 18000"</i> o <i>"Zapatillas 90000 en 3 cuotas"</i>).
                  </div>
                  <div className="bg-[#18181b] p-3 rounded-lg border border-[#27272a] text-xs">
                    <span className="font-semibold text-cyan-400 block mb-1">2. Carga Manual Web</span>
                    Hacé clic en el botón verde <b>+ Nuevo Gasto</b> arriba a la derecha para cargar una prueba rápida.
                  </div>
                  <div className="bg-[#18181b] p-3 rounded-lg border border-[#27272a] text-xs">
                    <span className="font-semibold text-violet-400 block mb-1">3. Base de Datos</span>
                    Recordá configurar tus claves en <code className="text-zinc-300 bg-black/40 px-1 py-0.5 rounded">.env.local</code> y correr la migración SQL en Supabase.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && !stats && (
          <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <p className="text-xs">Cargando estadísticas financieras...</p>
          </div>
        )}

        {/* Dashboard Content */}
        {stats && (
          <>
            <KpiCards stats={stats} currency={currency} exchangeRate={exchangeRate} />
            <BudgetPanel stats={stats} currency={currency} exchangeRate={exchangeRate} />
            <ChartsSection stats={stats} currency={currency} exchangeRate={exchangeRate} />
            <ExpensesTable
              expenses={expenses}
              currency={currency}
              exchangeRate={exchangeRate}
              onDeleteExpense={handleDeleteExpense}
            />
          </>
        )}
      </main>

      {/* New Expense Modal */}
      <NewExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onExpenseAdded={fetchData}
      />

      {/* New Income Modal */}
      <NewIncomeModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        onIncomeAdded={fetchData}
        selectedMonth={selectedMonth}
      />

      {/* Minimal Footer */}
      <footer className="border-t border-[#27272a] py-6 text-center text-xs text-zinc-500">
        Jarvis Finance — Asistente Inteligente de Gastos &middot; Impulsado por Gemini Flash
      </footer>
    </div>
  );
}
