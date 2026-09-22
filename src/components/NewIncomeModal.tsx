'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Income } from '@/lib/types';
import { dashboardHeaders } from '@/lib/api-client';

interface NewIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIncomeAdded: () => void;
  selectedMonth: string; // YYYY-MM
}

export function NewIncomeModal({ isOpen, onClose, onIncomeAdded, selectedMonth }: NewIncomeModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomes, setIncomes] = useState<Income[]>([]);

  const fetchIncomes = useCallback(async () => {
    try {
      const res = await fetch(`/api/incomes?month=${selectedMonth}`, { headers: dashboardHeaders });
      if (res.ok) {
        setIncomes(await res.json());
      }
    } catch {
      // keep previous list
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      fetchIncomes();
    }
  }, [isOpen, fetchIncomes]);

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
      const res = await fetch('/api/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({
          description: description.trim(),
          amount: Number(amount),
          currency,
          date,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al guardar el ingreso.');
      }

      setDescription('');
      setAmount('');
      await fetchIncomes();
      onIncomeAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este ingreso?')) return;
    try {
      const res = await fetch(`/api/incomes?id=${id}`, {
        method: 'DELETE',
        headers: dashboardHeaders,
      });
      if (res.ok) {
        await fetchIncomes();
        onIncomeAdded();
      } else {
        alert('No se pudo eliminar el ingreso.');
      }
    } catch (err) {
      console.error('Error deleting income:', err);
    }
  };

  const formatIncomeAmount = (inc: Income) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: inc.currency,
      maximumFractionDigits: 0,
    }).format(inc.amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#121215] border border-[#27272a] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Ingresos</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Carga y administrá tus ingresos del mes</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 border-b border-[#27272a]">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Sueldo, Freelance, Reembolso..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

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

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {loading ? 'Guardando...' : 'Guardar Ingreso'}
            </button>
          </div>
        </form>

        {/* Month incomes list */}
        <div className="p-5 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Ingresos de {selectedMonth}
          </p>
          {incomes.length > 0 ? (
            <div className="space-y-1">
              {incomes.map((inc) => (
                <div
                  key={inc.id}
                  className="flex items-center justify-between text-xs py-1.5 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-500 font-mono">{inc.date}</span>
                    <span className="text-zinc-200 truncate">{inc.description}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-emerald-400 font-semibold">
                      {formatIncomeAmount(inc)}
                    </span>
                    <button
                      onClick={() => handleDelete(inc.id)}
                      className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100"
                      title="Eliminar ingreso"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Sin ingresos registrados en este mes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
