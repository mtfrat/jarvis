'use client';

import React from 'react';
import { TrendingDown, TrendingUp, CreditCard, PieChart, CalendarDays, Wallet } from 'lucide-react';
import { DashboardStats } from '@/lib/types';

interface KpiCardsProps {
  stats: DashboardStats;
  currency: 'ARS' | 'USD';
  exchangeRate: number;
}

export function KpiCards({ stats, currency, exchangeRate }: KpiCardsProps) {
  const formatMoney = (amountArs: number) => {
    if (currency === 'USD') {
      const amountUsd = amountArs / exchangeRate;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(amountUsd);
    }
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amountArs);
  };

  const comparison = stats.previousMonthComparisonPercent;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Gasto Total del Mes */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Gasto Total</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Wallet className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold tracking-tight text-white font-mono">
          {formatMoney(stats.totalSpentArs)}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          {comparison !== null ? (
            <span
              className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full ${
                comparison <= 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {comparison <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {Math.abs(comparison)}% vs mes anterior
            </span>
          ) : (
            <span className="text-zinc-500">Primer mes registrado</span>
          )}
        </div>
      </div>

      {/* 2. Promedio Diario */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Promedio Diario</span>
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <CalendarDays className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold tracking-tight text-white font-mono">
          {formatMoney(stats.dailyAverageArs)}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          Ritmo estimado de gasto por día
        </div>
      </div>

      {/* 3. Cuotas del Mes */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Cuotas del Mes</span>
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold tracking-tight text-white font-mono">
          {formatMoney(stats.pendingInstallmentsAmountArs)}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          <span className="text-violet-400 font-semibold">{stats.pendingInstallmentsCount} cuotas</span> a pagar este mes
        </div>
      </div>

      {/* 4. Mayor Categoría */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Mayor Categoría</span>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <PieChart className="w-4 h-4" />
          </div>
        </div>
        <div className="text-xl lg:text-2xl font-bold tracking-tight text-white truncate">
          {stats.topCategory ? stats.topCategory.category : 'Sin gastos'}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          {stats.topCategory ? (
            <>
              <span className="text-amber-400 font-semibold">{stats.topCategory.percentage}%</span> del gasto mensual ({formatMoney(stats.topCategory.amountArs)})
            </>
          ) : (
            'Registra gastos para ver métricas'
          )}
        </div>
      </div>
    </div>
  );
}
