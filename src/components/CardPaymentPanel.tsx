'use client';

import React from 'react';
import { CreditCard, CalendarClock, CalendarDays } from 'lucide-react';
import { DashboardStats } from '@/lib/types';
import { fmtDate } from '@/lib/format';

interface CardPaymentPanelProps {
  stats: DashboardStats;
  currency: 'ARS' | 'USD';
  exchangeRate: number;
}

const formatMoney = (amountArs: number, currency: 'ARS' | 'USD', exchangeRate: number) => {
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

export function CardPaymentPanel({ stats, currency, exchangeRate }: CardPaymentPanelProps) {
  const statement = stats.cardStatement;
  if (!statement) return null;

  const isDue = statement.status === 'due';

  return (
    <div
      className={`bg-[#121215] border rounded-xl p-5 ${
        isDue ? 'border-amber-500/30' : 'border-[#27272a]'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${
              isDue ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-400'
            }`}
          >
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Pago de tarjeta</h3>
            <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              {fmtDate(statement.periodStart)} → {fmtDate(statement.periodEnd)}
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-2xl font-bold font-mono ${isDue ? 'text-amber-300' : 'text-white'}`}>
            {formatMoney(statement.totalArs, currency, exchangeRate)}
          </div>
          <div
            className={`text-xs flex items-center justify-end gap-1.5 mt-0.5 ${
              isDue ? 'text-amber-400' : 'text-zinc-400'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            {isDue && statement.dueDate ? (
              <span>
                Vence el <b>{fmtDate(statement.dueDate)}</b>
              </span>
            ) : (
              <span>
                Cierra el <b>{fmtDate(statement.closingDate)}</b>
                {statement.dueDate ? ` · vence el ${fmtDate(statement.dueDate)}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
