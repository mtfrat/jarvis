'use client';

import React from 'react';
import { Bot, Plus, Calendar, DollarSign, Banknote } from 'lucide-react';

interface HeaderProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  currency: 'ARS' | 'USD';
  onCurrencyToggle: () => void;
  onOpenNewExpense: () => void;
  onOpenNewIncome: () => void;
  exchangeRate: number;
}

export function Header({
  selectedMonth,
  onMonthChange,
  currency,
  onCurrencyToggle,
  onOpenNewExpense,
  onOpenNewIncome,
  exchangeRate,
}: HeaderProps) {
  return (
    <header className="border-b border-[#27272a] bg-[#121215]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <Bot className="w-6 h-6 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-lg">JARVIS</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
                FINANCE
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block">Control inteligente con Telegram & Gemini IA</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <div className="flex items-center gap-2 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-sm">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              className="bg-transparent text-white text-xs sm:text-sm focus:outline-none cursor-pointer"
            />
          </div>

          {/* Currency Toggle */}
          <button
            onClick={onCurrencyToggle}
            title={`Cotización dólar: $${exchangeRate.toLocaleString('es-AR')}`}
            className="flex items-center gap-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition text-zinc-200"
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>{currency}</span>
            <span className="text-[10px] text-zinc-400 hidden md:inline">
              (${exchangeRate})
            </span>
          </button>

          {/* Add Income Button */}
          <button
            onClick={onOpenNewIncome}
            className="flex items-center gap-1.5 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition text-zinc-200 cursor-pointer"
          >
            <Banknote className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Ingreso</span>
          </button>

          {/* Add Expense Button */}
          <button
            onClick={onOpenNewExpense}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-semibold text-xs sm:text-sm px-3.5 py-1.5 rounded-lg shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Gasto</span>
          </button>
        </div>
      </div>
    </header>
  );
}
