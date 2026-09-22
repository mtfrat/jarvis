'use client';

import React from 'react';
import { TrendingDown, TrendingUp, CreditCard, PieChart, CalendarDays, Wallet, Flame, PiggyBank, RefreshCw } from 'lucide-react';
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              {Math.abs(comparison)}% vs mes anterior{stats.isCurrentMonth ? ' a esta fecha' : ''}
            </span>
          ) : (
            <span className="text-zinc-500">Primer mes registrado</span>
          )}
        </div>
      </div>

      {/* 2. Balance del Mes */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Balance del Mes</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <PiggyBank className="w-4 h-4" />
          </div>
        </div>
        <div
          className={`text-2xl lg:text-3xl font-bold tracking-tight font-mono ${
            stats.balanceArs < 0 ? 'text-rose-400' : 'text-white'
          }`}
        >
          {formatMoney(stats.balanceArs)}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          {stats.recurringIncomeArs > 0 ? (
            <>
              Ingresos:{' '}
              <span className="text-emerald-400 font-semibold">{formatMoney(stats.totalIncomeArs)}</span>
              <span className="text-zinc-500">
                {' '}
                (manuales {formatMoney(stats.totalIncomeArs - stats.recurringIncomeArs)} · recurrentes{' '}
                {formatMoney(stats.recurringIncomeArs)})
              </span>
            </>
          ) : (
            <>
              Ingresos:{' '}
              <span className="text-emerald-400 font-semibold">{formatMoney(stats.totalIncomeArs)}</span> este
              mes
            </>
          )}
        </div>
      </div>

      {/* 3. Promedio Diario */}
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
          {stats.projectedMonthTotalArs !== null ? (
            <>
              Proyección de cierre:{' '}
              <span className="text-cyan-400 font-semibold">{formatMoney(stats.projectedMonthTotalArs)}</span>
            </>
          ) : (
            'Ritmo estimado de gasto por día'
          )}
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
          {formatMoney(stats.installmentsMonthAmountArs)}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          <span className="text-violet-400 font-semibold">{stats.installmentsMonthCount} cuotas</span> este mes
          {stats.futureInstallmentsTotalArs > 0 && (
            <>
              {' · '}comprometido 6m:{' '}
              <span className="text-violet-300 font-semibold">{formatMoney(stats.futureInstallmentsTotalArs)}</span>
            </>
          )}
        </div>
      </div>

      {/* 5. Racha sin gastos */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 relative overflow-hidden group hover:border-zinc-700 transition">
        <div className="flex items-center justify-between text-zinc-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Racha Sin Gastos</span>
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
            <Flame className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl lg:text-3xl font-bold tracking-tight text-white font-mono">
          {stats.streakDaysWithoutSpending !== null ? `${stats.streakDaysWithoutSpending} días` : '—'}
        </div>
        <div className="mt-3 text-xs text-zinc-400">
          {stats.streakDaysWithoutSpending === null
            ? 'Sin historial de gastos'
            : stats.streakDaysWithoutSpending === 0
              ? 'Gastaste hoy — racha cortada'
              : 'Días consecutivos sin gastar'}
        </div>
      </div>

      {/* 6. Mayor Categoría */}
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
      {/* KPI: Recurrentes */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Ingresos Recurrentes</p>
          <p className="text-xl font-semibold text-white mt-1 font-mono tracking-tight">
            {formatMoney(stats.recurringIncomeArs)}
          </p>
          <div className="mt-3 text-xs text-zinc-400">Se suman al balance cada mes</div>
        </div>
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
          <RefreshCw className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
