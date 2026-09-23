'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Info } from 'lucide-react';
import { Expense, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/types';
import { dashboardHeaders } from '@/lib/api-client';

interface EditExpenseModalProps {
  expense: Expense | null;
  onClose: () => void;
  onExpenseUpdated: () => void;
}

export function EditExpenseModal({ expense, onClose, onExpenseUpdated }: EditExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [discount, setDiscount] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGroup = Boolean(expense?.installment_group_id);

  useEffect(() => {
    if (!expense) return;
    const baseDesc = expense.installment_group_id
      ? expense.description.replace(/ \(Cuota \d+\/\d+\)$/, '')
      : expense.description;
    setDescription(baseDesc);
    setAmount(String(expense.amount));
    setCategory(expense.category);
    setPaymentMethod(expense.payment_method || 'Otro');
    setDiscount(expense.discount_amount ? String(expense.discount_amount) : '');
    setDate(expense.date);
    setError(null);
  }, [expense]);

  if (!expense) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Ingresá una descripción.');
      return;
    }
    if (!isGroup && (!amount || Number(amount) <= 0)) {
      setError('Ingresá un monto válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { id: expense.id };
      if (isGroup) {
        body.description = description.trim();
        body.category = category;
        body.payment_method = paymentMethod;
      } else {
        body.description = description.trim();
        body.amount = Number(amount);
        body.category = category;
        body.payment_method = paymentMethod;
        body.date = date;
        body.discount_amount = discount === '' ? 0 : Number(discount);
      }

      const res = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al guardar los cambios.');
      }

      onExpenseUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121215] border border-[#27272a] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Editar Gasto</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isGroup ? 'Modifica descripción, categoría y método del grupo de cuotas' : 'Modifica los datos del movimiento'}
            </p>
          </div>
          <button
            onClick={onClose}
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

          {isGroup && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Este gasto tiene {expense.installments_total} cuotas. El monto y la fecha no se pueden editar
                (borrá y recreá el gasto si necesitás cambiarlos).
              </span>
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
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Monto {isGroup && <span className="text-zinc-500 font-normal">(fijo en cuotas)</span>}
              </label>
              <input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isGroup}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Moneda</label>
              <input
                type="text"
                value={expense.currency}
                disabled
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-2 text-sm text-white font-mono focus:outline-none opacity-40 cursor-not-allowed"
              />
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

          {/* Date & Discount (only for non-groups) */}
          {!isGroup && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Descuento <span className="text-zinc-500 font-normal">(opcional)</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
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
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
