'use client';

import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/types';

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) {
      setError('Ingresá una descripción y un monto válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          amount: Number(amount),
          currency,
          category,
          payment_method: paymentMethod,
          installments_total: Number(installments) || 1,
          date,
        }),
      });

      if (!res.ok) {
        throw new Error('Error al guardar el gasto.');
      }

      onExpenseAdded();
      onClose();
      // Reset
      setDescription('');
      setAmount('');
      setInstallments('1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121215] border border-[#27272a] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Nuevo Gasto Manual</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Carga directa a la base de datos</p>
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
                onChange={(e) => setAmount(e.target.value)}
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
              {loading ? 'Guardando...' : 'Guardar Gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
