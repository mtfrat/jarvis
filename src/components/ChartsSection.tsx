'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { DashboardStats } from '@/lib/types';

interface ChartsSectionProps {
  stats: DashboardStats;
  currency: 'ARS' | 'USD';
  exchangeRate: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Supermercado: '#10b981',
  'Salidas y Comida': '#f59e0b',
  Transporte: '#06b6d4',
  Servicios: '#8b5cf6',
  Salud: '#ef4444',
  Hogar: '#3b82f6',
  Entretenimiento: '#ec4899',
  Educación: '#14b8a6',
  Indumentaria: '#f97316',
  Otros: '#71717a',
};

export function ChartsSection({ stats, currency, exchangeRate }: ChartsSectionProps) {
  const formatMoney = (amountArs: number) => {
    if (currency === 'USD') {
      return `$${Math.round(amountArs / exchangeRate).toLocaleString('en-US')}`;
    }
    return `$${Math.round(amountArs).toLocaleString('es-AR')}`;
  };

  // 1. Daily timeline data
  const timelineData = stats.monthlyTimeline.map((item) => ({
    day: item.date.split('-')[2], // get day '01', '02', etc.
    amount: item.amountArs,
    formatted: formatMoney(item.amountArs),
  }));

  // 2. Category Pie data
  const categoryData = stats.categoryBreakdown.map((item) => ({
    name: item.category,
    value: item.amountArs,
    percentage: item.percentage,
    color: CATEGORY_COLORS[item.category] || '#a1a1aa',
  }));

  // 3. Day of week data
  const dayOfWeekData = stats.dayOfWeekBreakdown.map((item) => ({
    name: item.dayName.substring(0, 3), // Lun, Mar, Mié...
    fullName: item.dayName,
    amount: item.amountArs,
    count: item.count,
  }));

  // 4. Future installments data
  const futureData = stats.futureInstallments.map((item) => {
    const [year, month] = item.month.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, 1);
    const monthLabel = dateObj.toLocaleString('es-AR', { month: 'short' });
    return {
      month: `${monthLabel} ${year.slice(2)}`,
      amount: item.amountArs,
      count: item.count,
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* 1. Evolución Diaria del Gasto */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Evolución Diaria del Gasto</h3>
          <p className="text-xs text-zinc-400 mt-1">Gasto distribuido a lo largo del mes</p>
        </div>
        <div className="h-64 w-full mt-4">
          {timelineData.length > 0 && stats.totalSpentArs > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickFormatter={(val) => formatMoney(val)} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#18181b] border border-[#27272a] p-2.5 rounded-lg shadow-xl text-xs">
                          <p className="text-zinc-400">Día {data.day}</p>
                          <p className="font-bold text-emerald-400 font-mono mt-0.5">{data.formatted}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">
              No hay gastos registrados en este período
            </div>
          )}
        </div>
      </div>

      {/* 2. Distribución por Categorías */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Distribución por Categorías</h3>
          <p className="text-xs text-zinc-400 mt-1">Porcentaje y monto por tipo de gasto</p>
        </div>
        <div className="h-64 w-full mt-4 flex items-center justify-center">
          {categoryData.length > 0 ? (
            <div className="w-full h-full flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#18181b] border border-[#27272a] p-2.5 rounded-lg shadow-xl text-xs">
                              <p className="font-semibold text-white">{data.name}</p>
                              <p className="text-emerald-400 font-mono font-bold mt-0.5">
                                {formatMoney(data.value)} ({data.percentage}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend List */}
              <div className="w-full sm:w-1/2 max-h-56 overflow-y-auto space-y-2 pr-2">
                {categoryData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-zinc-300 truncate max-w-[110px]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-zinc-400">{item.percentage}%</span>
                      <span className="text-zinc-200 font-medium">{formatMoney(item.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">
              Sin datos de categorías en este mes
            </div>
          )}
        </div>
      </div>

      {/* 3. Días de Mayor Gasto (Lunes a Domingo) */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Hábitos por Día de la Semana</h3>
          <p className="text-xs text-zinc-400 mt-1">¿Qué días gastas más dinero?</p>
        </div>
        <div className="h-64 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayOfWeekData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickFormatter={(val) => formatMoney(val)} tickLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#18181b] border border-[#27272a] p-2.5 rounded-lg shadow-xl text-xs">
                        <p className="font-semibold text-white">{data.fullName}</p>
                        <p className="text-cyan-400 font-mono font-bold mt-0.5">{formatMoney(data.amount)}</p>
                        <p className="text-zinc-400 text-[10px] mt-0.5">{data.count} transacciones</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="amount" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Proyección de Cuotas Futuras */}
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Compromiso en Cuotas Futuras</h3>
          <p className="text-xs text-zinc-400 mt-1">Vencimientos de compras financiadas para los próximos meses</p>
        </div>
        <div className="h-64 w-full mt-4">
          {futureData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={futureData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickFormatter={(val) => formatMoney(val)} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#18181b] border border-[#27272a] p-2.5 rounded-lg shadow-xl text-xs">
                          <p className="font-semibold text-white">{data.month}</p>
                          <p className="text-violet-400 font-mono font-bold mt-0.5">{formatMoney(data.amount)}</p>
                          <p className="text-zinc-400 text-[10px] mt-0.5">{data.count} cuotas comprometidas</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">
              No hay compromisos de cuotas futuras registradas
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
