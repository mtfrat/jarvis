'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Target, Trash2, Plus } from 'lucide-react';
import { DashboardStats, Budget, EXPENSE_CATEGORIES } from '@/lib/types';
import { dashboardHeaders } from '@/lib/api-client';

interface BudgetPanelProps {
  stats: DashboardStats;
  currency: 'ARS' | 'USD';
  exchangeRate: number;
}

export function BudgetPanel({ stats, currency, exchangeRate }: BudgetPanelProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch('/api/budgets', { headers: dashboardHeaders });
      if (res.ok) setBudgets(await res.json());
    } catch {
      // keep previous list
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const formatMoney = (amountArs: number) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(amountArs / exchangeRate);
    }
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amountArs);
  };

  const spentByCategory = new Map(stats.categoryBreakdown.map((c) => [c.category, c.amountArs]));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Ingresá un monto mayor a0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({ category, monthly_amount: Number(amount) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al guardar el presupuesto.');
      }
      setAmount('');
      await fetchBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: string) => {
    if (!confirm(`¿Eliminar el presupuesto de ${cat}?`)) return;
    try {
      const res = await fetch(`/api/budgets?category=${encodeURIComponent(cat)}`, {
        method: 'DELETE',
        headers: dashboardHeaders,
      });
      if (res.ok) await fetchBudgets();
      else alert('No se pudo eliminar el presupuesto.');
    } catch (err) {
      console.error('Error deleting budget:', err);
    }
  };

  return (
    <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 mt-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Presupuestos del Mes</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Límite mensual por categoría — se avisa al acercarte o exceder
            </p>
            {stats.budgetsExceeded.length > 0 && (
              <p className="text-xs text-rose-400 font-semibold mt-1.5">
                🚨 Excedidos este mes: {stats.budgetsExceeded.join(', ')}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="flex items-end gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500 cursor-pointer"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-[#18181b] text-white">
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Límite (ARS)
            </label>
            <input
              type="number"
              min="1"
              step="any"
              placeholder="50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-black transition disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {error && <span className="text-[11px] text-rose-400 max-w-[180px]">{error}</span>}
        </form>
      </div>

      <div className="mt-4 space-y-3">
        {budgets.length > 0 ? (
          budgets.map((b) => {
            const spent = spentByCategory.get(b.category) || 0;
            const limit = Number(b.monthly_amount);
            const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            const barColor =
              percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
            const statusText =
              percent >= 100
                ? `Excedido en ${formatMoney(spent - limit)}`
                : percent >= 80
                  ? 'Cerca del límite'
                  : `Restan ${formatMoney(Math.max(0, limit - spent))}`;
            const statusColor =
              percent >= 100 ? 'text-rose-400' : percent >= 80 ? 'text-amber-400' : 'text-emerald-400';

            return (
              <div key={b.category} className="group">
                <div className="flex items-center justify-between text-xs mb-1.5 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-200 font-medium truncate">{b.category}</span>
                    <span className="text-zinc-500 font-mono shrink-0">
                      {formatMoney(spent)} / {formatMoney(limit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-semibold ${statusColor}`}>
                      {percent}% · {statusText}
                    </span>
                    <button
                      onClick={() => handleDelete(b.category)}
                      className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100"
                      title="Eliminar presupuesto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="h-2 w-full bg-zinc-800/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-zinc-600">
            Sin presupuestos — creá el primero con el formulario de arriba.
          </p>
        )}
      </div>
    </div>
  );
}
