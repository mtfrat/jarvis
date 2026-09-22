'use client';

import React, { useState } from 'react';
import { Search, Trash2, Mic, Receipt, MessageSquare, Laptop, Filter, Download } from 'lucide-react';
import { Expense, EXPENSE_CATEGORIES } from '@/lib/types';

interface ExpensesTableProps {
  expenses: Expense[];
  currency: 'ARS' | 'USD';
  exchangeRate: number;
  onDeleteExpense: (expense: Expense) => void;
}

export function ExpensesTable({
  expenses,
  currency,
  exchangeRate,
  onDeleteExpense,
}: ExpensesTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filtered = expenses.filter((exp) => {
    const matchesSearch = exp.description.toLowerCase().includes(search.toLowerCase()) ||
      exp.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || exp.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const formatMoney = (amountArs: number, origCurrency: string, origAmount: number) => {
    if (currency === 'USD') {
      const val = origCurrency === 'USD' ? origAmount : amountArs / exchangeRate;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(val);
    }
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amountArs);
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'fecha',
      'descripcion',
      'categoria',
      'metodo_pago',
      'cuota',
      'monto',
      'moneda',
      'monto_ars',
      'fuente',
    ];
    const rows = filtered.map((e) =>
      [
        e.date,
        e.description,
        e.category,
        e.payment_method,
        `${e.installment_number}/${e.installments_total}`,
        e.amount,
        e.currency,
        e.amount_ars,
        e.source,
      ]
        .map(esc)
        .join(';')
    );
    const csv = '﻿' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderSourceIcon = (source: string) => {
    switch (source) {
      case 'telegram_voice':
        return (
          <span title="Nota de voz en Telegram" className="inline-flex items-center text-cyan-400">
            <Mic className="w-3.5 h-3.5" />
          </span>
        );
      case 'telegram_receipt':
        return (
          <span title="Ticket / Foto en Telegram" className="inline-flex items-center text-amber-400">
            <Receipt className="w-3.5 h-3.5" />
          </span>
        );
      case 'telegram_text':
        return (
          <span title="Texto en Telegram" className="inline-flex items-center text-emerald-400">
            <MessageSquare className="w-3.5 h-3.5" />
          </span>
        );
      default:
        return (
          <span title="Carga manual desde el Dashboard" className="inline-flex items-center text-zinc-400">
            <Laptop className="w-3.5 h-3.5" />
          </span>
        );
    }
  };

  return (
    <div className="bg-[#121215] border border-[#27272a] rounded-xl mt-6 overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-[#27272a] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Movimientos del Período</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {filtered.length} {filtered.length === 1 ? 'gasto registrado' : 'gastos registrados'}
            {filtered.length > 0 &&
              ` · promedio ${formatMoney(
                filtered.reduce((sum, e) => sum + Number(e.amount_ars), 0) / filtered.length,
                'ARS',
                0
              )}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar gasto o comercio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#18181b] text-white">Todas las categorías</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-[#18181b] text-white">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV */}
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 transition disabled:opacity-40 cursor-pointer shrink-0"
            title="Exportar los gastos filtrados a CSV"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#27272a] bg-[#18181b]/50 text-zinc-400 text-[11px] font-medium uppercase tracking-wider">
              <th className="py-3 px-4">Fecha</th>
              <th className="py-3 px-4">Descripción</th>
              <th className="py-3 px-4">Categoría</th>
              <th className="py-3 px-4">Método</th>
              <th className="py-3 px-4 text-center">Cuota</th>
              <th className="py-3 px-4 text-right">Monto</th>
              <th className="py-3 px-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a] text-xs">
            {filtered.length > 0 ? (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-[#18181b]/40 transition group">
                  <td className="py-3 px-4 text-zinc-400 whitespace-nowrap font-mono">
                    {item.date}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {renderSourceIcon(item.source)}
                      <span className="font-medium text-white group-hover:text-emerald-300 transition">
                        {item.description}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-300">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[11px] border border-zinc-700/50">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-zinc-400">
                    {item.payment_method || 'Otro'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.installments_total > 1 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 font-semibold border border-violet-500/20 text-[10px]">
                        {item.installment_number}/{item.installments_total}
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                    {formatMoney(Number(item.amount_ars), item.currency, Number(item.amount))}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => onDeleteExpense(item)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100 cursor-pointer"
                      title={item.installment_group_id ? 'Eliminar todas las cuotas' : 'Eliminar gasto'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  No se encontraron gastos con los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
