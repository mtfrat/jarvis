'use client';

import React, { useState } from 'react';
import { X, Check, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, Expense } from '@/lib/types';
import { dashboardHeaders } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseAdded: () => void;
}

export function NewExpenseModal({ isOpen, onClose, onExpenseAdded }: NewExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [installments, setInstallments] = useState('1');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reimbursable, setReimbursable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Expense[] | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setDuplicates(null);
    setError(null);
    onClose();
  };

  const submit = async (force: boolean) => {
    if (!description.trim() || !amount || Number(amount) <= 0) {
      setError('Ingresá una descripción y un monto válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({
          description: description.trim(),
          amount: Number(amount),
          currency,
          category,
          payment_method: paymentMethod,
          installments_total: Number(installments) || 1,
          date,
          reimbursable,
          ...(force ? { force: true } : {}),
        }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        setDuplicates(Array.isArray(data?.duplicates) ? data.duplicates : []);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al guardar el gasto.');
      }

      onExpenseAdded();
      handleClose();
      // Reset
      setDescription('');
      setAmount('');
      setInstallments('1');
      setReimbursable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121215] border border-[#27272a] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Nuevo Gasto Manual</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Carga directa a la base de datos</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          {duplicates && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Posible duplicado — {duplicates.length} gasto
                {duplicates.length > 1 ? 's' : ''} con el mismo monto en los últimos días:
              </div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {duplicates.map((d) => (
                  <li key={d.id} className="text-[11px] text-zinc-300 flex justify-between gap-2">
                    <span className="truncate">
                      {fmtDate(d.date)} · {d.description}{' '}
                      <span className="text-zinc-500">({d.category})</span>
                    </span>
                    <span className="font-mono shrink-0 text-zinc-400">
                      {new Intl.NumberFormat(d.currency === 'USD' ? 'en-US' : 'es-AR', {
                        style: 'currency',
                        currency: d.currency,
                        maximumFractionDigits: 2,
                      }).format(d.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={loading}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Guardando...' : 'Sí, cargar igual'}
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicates(null)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                >
                  Revisar
                </button>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Descripción / Comercio</label>
            <input
              type="text"
              required
              placeholder="Ej: Supermercado Coto, Zapatillas..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-zinc-300 mb-1">Monto</label>
              <input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setDuplicates(null);
                }}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'ARS' | 'USD')}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ARS">ARS ($)</option>
                <option value="USD">USD (u$s)</option>
              </select>
            </div>
          </div>

          {/* Category & Payment Method */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Método de Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Installments & Date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Cuotas</label>
              <input
                type="number"
                min="1"
                max="60"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Reimbursable */}
          <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#18181b] border border-[#27272a] cursor-pointer hover:border-sky-500/40 transition">
            <input
              type="checkbox"
              checked={reimbursable}
              onChange={(e) => setReimbursable(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-sky-500 cursor-pointer"
            />
            <span className="text-xs">
              <span className="font-medium text-sky-300">100% reintegrable</span>
              <span className="block text-zinc-500">
                Figura en el pago de la tarjeta, pero no cuenta como gasto en tus estadísticas.
              </span>
            </span>
          </label>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {loading ? 'Guardando...' : 'Guardar Gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
