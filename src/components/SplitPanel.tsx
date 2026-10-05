'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Trash2, Plus, ArrowLeft, Check, Split, ChevronDown } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
} from '@/lib/types';
import type { SplitMeetingSummary, SplitMeetingDetail } from '@/lib/split-service';
import { dashboardHeaders } from '@/lib/api-client';

interface SplitPanelProps {
  onExpenseAdded: () => void;
}

const MY_NAME_KEY = 'jarvis_split_me';

function formatMoney(cents: number, currency: 'ARS' | 'USD'): string {
  const amount = cents / 100;
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SplitPanel({ onExpenseAdded }: SplitPanelProps) {
  const [meetings, setMeetings] = useState<SplitMeetingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SplitMeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newCurrency, setNewCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [newMembers, setNewMembers] = useState<string[]>(['', '']);
  const [saving, setSaving] = useState(false);

  // Add expense form
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expPaidBy, setExpPaidBy] = useState('');

  // "Who am I" (persisted by NAME — los IDs cambian entre reuniones)
  const [savedName, setSavedName] = useState('');
  const [myId, setMyId] = useState('');
  const [jarvisCategory, setJarvisCategory] = useState<string>('Salidas y Comida');
  const [jarvisMethod, setJarvisMethod] = useState<string>('Efectivo');
  const [confirmingJarvis, setConfirmingJarvis] = useState(false);
  const [addingToJarvis, setAddingToJarvis] = useState(false);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/splits', { headers: dashboardHeaders });
      if (res.ok) setMeetings(await res.json());
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/splits?id=${id}`, { headers: dashboardHeaders });
      if (res.ok) {
        setDetail(await res.json());
      } else if (res.status === 404) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch {
      // keep previous detail
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(MY_NAME_KEY) : null;
    if (saved) setSavedName(saved);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setDetail(null);
      setError(null);
      setConfirmingJarvis(false);
      fetchDetail(selectedId);
    }
  }, [selectedId, fetchDetail]);

  // Al cargar detalle: matchear "quién sos vos" por nombre; default del pagador
  useEffect(() => {
    if (!detail) return;
    if (detail.members.length > 0) {
      setExpPaidBy((prev) =>
        prev && detail.members.some((m) => m.id === prev)
          ? prev
          : detail.members[0].id
      );
      if (savedName) {
        const match = detail.members.find(
          (m) => m.name.toLowerCase() === savedName.toLowerCase()
        );
        setMyId(match ? match.id : '');
      }
    }
  }, [detail, savedName]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({
          name: newName,
          date: newDate,
          currency: newCurrency,
          members: newMembers,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'No pude crear la reunión.');
      setNewName('');
      setNewMembers(['', '']);
      setShowCreate(false);
      await fetchMeetings();
      setSelectedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMeeting = async (m: SplitMeetingSummary) => {
    if (!confirm(`¿Eliminar la reunión "${m.name}" con todos sus gastos?`)) return;
    try {
      const res = await fetch(`/api/splits?id=${m.id}`, {
        method: 'DELETE',
        headers: dashboardHeaders,
      });
      if (!res.ok) throw new Error('No se pudo eliminar.');
      if (selectedId === m.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await fetchMeetings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/splits/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({
          meeting_id: detail.meeting.id,
          description: expDescription,
          amount: Number(expAmount),
          paid_by: expPaidBy,
          date: detail.meeting.date,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'No pude agregar el gasto.');
      setExpDescription('');
      setExpAmount('');
      await fetchDetail(detail.meeting.id);
      await fetchMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!detail) return;
    if (!confirm('¿Eliminar este gasto de la reunión?')) return;
    try {
      const res = await fetch(`/api/splits/expenses?id=${expenseId}`, {
        method: 'DELETE',
        headers: dashboardHeaders,
      });
      if (!res.ok) throw new Error('No se pudo eliminar.');
      await fetchDetail(detail.meeting.id);
      await fetchMeetings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  };

  const me = detail?.members.find((m) => m.id === myId) ?? null;
  const myBalance = detail?.balances.find((b) => b.member_id === myId) ?? null;

  const selectMe = (memberId: string) => {
    setMyId(memberId);
    const member = detail?.members.find((m) => m.id === memberId);
    if (member) {
      setSavedName(member.name);
      if (typeof window !== 'undefined') {
        localStorage.setItem(MY_NAME_KEY, member.name);
      }
    }
    setConfirmingJarvis(false);
  };

  const handleAddToJarvis = async () => {
    if (!detail || !me || !myBalance) return;
    if (me.added_to_jarvis) {
      const ok = confirm(
        'Ya agregaste tu parte antes. ¿Querés agregarla de nuevo? (revisá que no quede duplicado en Jarvis)'
      );
      if (!ok) return;
    }
    setAddingToJarvis(true);
    setError(null);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({
          description: detail.meeting.name,
          amount: myBalance.owed / 100,
          currency: detail.meeting.currency,
          category: jarvisCategory,
          payment_method: jarvisMethod,
          installments_total: 1,
          date: detail.meeting.date,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'No pude crear el gasto en Jarvis.');

      await fetch('/api/splits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...dashboardHeaders },
        body: JSON.stringify({ member_id: me.id }),
      });

      setConfirmingJarvis(false);
      await fetchDetail(detail.meeting.id);
      onExpenseAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setAddingToJarvis(false);
    }
  };

  // ---------------- LIST VIEW ----------------
  if (!selectedId) {
    return (
      <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Split className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">División de Cuentas</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cargá los gastos de una reunión y quién los pagó — mirá quién le debe a quién y
                agregá solo tu parte a Jarvis.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition shrink-0 cursor-pointer"
          >
            {showCreate ? <ChevronDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            Nueva reunión
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mt-4 p-4 bg-[#18181b] border border-[#27272a] rounded-lg space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Nombre de la reunión
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cena del sábado"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Moneda
                </label>
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value as 'ARS' | 'USD')}
                  className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="ARS" className="bg-[#121215]">
                    ARS ($)
                  </option>
                  <option value="USD" className="bg-[#121215]">
                    USD (u$s)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Participantes (mínimo 2)
              </label>
              <div className="space-y-2">
                {newMembers.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={`Participante ${i + 1}${i === 0 ? ' (vos)' : ''}`}
                      value={m}
                      onChange={(e) =>
                        setNewMembers((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      className="flex-1 bg-[#121215] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                    {newMembers.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setNewMembers((prev) => prev.filter((_, j) => j !== i))}
                        className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setNewMembers((prev) => [...prev, ''])}
                className="mt-2 flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Agregar participante
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Creando...' : 'Crear reunión'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-xs text-zinc-600">Cargando reuniones...</p>
          ) : meetings.length > 0 ? (
            meetings.map((m) => (
              <div
                key={m.id}
                className="group flex items-center justify-between gap-3 p-3 bg-[#18181b] border border-[#27272a] rounded-lg hover:border-cyan-500/30 transition cursor-pointer"
                onClick={() => setSelectedId(m.id)}
              >
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{m.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {m.date} · {m.member_count} participantes · {m.expense_count} gastos
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-mono text-cyan-400">
                    {formatMoney(m.total, m.currency)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMeeting(m);
                    }}
                    className="p-1.5 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100"
                    title="Eliminar reunión"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-600">
              Sin reuniones — creá la primera con «Nueva reunión».
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------- DETAIL VIEW ----------------
  const d = detail;
  const currency = d?.meeting.currency ?? 'ARS';

  return (
    <div className="bg-[#121215] border border-[#27272a] rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              fetchMeetings();
            }}
            className="p-2 rounded-lg bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-700 transition shrink-0 cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white tracking-wide truncate">
              {d?.meeting.name ?? 'Cargando...'}
            </h3>
            {d && (
              <p className="text-xs text-zinc-400 mt-0.5">
                {d.meeting.date} · Total {formatMoney(d.total, currency)} · Partes iguales entre{' '}
                {d.members.length} participantes
              </p>
            )}
          </div>
        </div>
        {d && (
          <div className="flex items-center gap-2 shrink-0">
            <Users className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-400">{d.members.length}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {!d ? (
        <p className="mt-4 text-xs text-zinc-600">Cargando detalle...</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* GASTOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Gastos
              </h4>
              <span className="text-[11px] text-zinc-500">{d.expenses.length} cargados</span>
            </div>

            <form onSubmit={handleAddExpense} className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cena"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="w-28">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Monto ({currency})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="w-32">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Pagó
                </label>
                <select
                  value={expPaidBy}
                  onChange={(e) => setExpPaidBy(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  {d.members.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#18181b]">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 inline" /> Agregar
              </button>
            </form>

            <div className="space-y-1.5">
              {d.expenses.length === 0 ? (
                <p className="text-xs text-zinc-600">Sin gastos cargados todavía.</p>
              ) : (
                d.expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="group flex items-center justify-between gap-2 p-2.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-zinc-200 font-medium truncate">{exp.description}</p>
                      <p className="text-[11px] text-zinc-500">
                        Pagó: <span className="text-cyan-400">{exp.paid_by_name}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-zinc-300">
                        {formatMoney(Math.round(exp.amount * 100), currency)}
                      </span>
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-60 group-hover:opacity-100"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SALDOS + TRANSFERS + AGREGAR MI PARTE */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Saldos
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                      <th className="text-left py-1.5 pr-2">Participante</th>
                      <th className="text-right py-1.5 px-2">Pagó</th>
                      <th className="text-right py-1.5 px-2">Le corresponde</th>
                      <th className="text-right py-1.5 pl-2">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.balances.map((b) => (
                      <tr
                        key={b.member_id}
                        className={`border-t border-[#27272a] ${
                          b.member_id === myId ? 'bg-cyan-500/5' : ''
                        }`}
                      >
                        <td className="py-2 pr-2 text-zinc-200">
                          {b.name}
                          {b.member_id === myId && (
                            <span className="ml-1.5 text-[9px] text-cyan-400 uppercase">vos</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-400">
                          {formatMoney(b.paid, currency)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-400">
                          {formatMoney(b.owed, currency)}
                        </td>
                        <td
                          className={`py-2 pl-2 text-right font-mono font-semibold ${
                            b.net > 0
                              ? 'text-emerald-400'
                              : b.net < 0
                                ? 'text-rose-400'
                                : 'text-zinc-500'
                          }`}
                        >
                          {b.net > 0 ? '+' : ''}
                          {formatMoney(b.net, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                (+) le deben a esa persona · (−) esa persona debe
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                A quién le pagar
              </h4>
              {d.transfers.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  {d.expenses.length === 0
                    ? 'Cargá gastos para ver cómo se salda.'
                    : 'Todo saldado — nadie le debe a nadie.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {d.transfers.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between p-2.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs"
                    >
                      <span className="text-zinc-300">
                        <span className="text-rose-400 font-medium">{t.from_name}</span>
                        <span className="text-zinc-500"> le debe </span>
                        <span className="text-emerald-400 font-medium">{t.to_name}</span>
                      </span>
                      <span className="font-mono text-white font-semibold">
                        {formatMoney(t.amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 bg-[#18181b] border border-cyan-500/20 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Agregar mi parte a Jarvis
                </h4>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  ¿Quién sos vos?
                </label>
                <select
                  value={myId}
                  onChange={(e) => selectMe(e.target.value)}
                  className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="" className="bg-[#121215]">
                    Elegí tu nombre...
                  </option>
                  {d.members.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#121215]">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {me && myBalance && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Tu parte del gasto total:</span>
                    <span className="font-mono text-white font-semibold">
                      {formatMoney(myBalance.owed, currency)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {me.added_to_jarvis
                      ? '✓ Ya la agregaste a Jarvis.'
                      : 'Se crea un gasto por tu porción (no por lo que pagaste).'}
                  </p>

                  {!confirmingJarvis ? (
                    <button
                      onClick={() => {
                        if (myBalance.owed <= 0) return;
                        setConfirmingJarvis(true);
                      }}
                      disabled={myBalance.owed <= 0}
                      className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {myBalance.owed <= 0
                        ? 'Sin gastos todavía'
                        : `Agregar ${formatMoney(myBalance.owed, currency)} a Jarvis`}
                    </button>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-[#27272a]">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                            Categoría
                          </label>
                          <select
                            value={jarvisCategory}
                            onChange={(e) => setJarvisCategory(e.target.value)}
                            className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                          >
                            {EXPENSE_CATEGORIES.map((c) => (
                              <option key={c} value={c} className="bg-[#121215]">
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                            Método de pago
                          </label>
                          <select
                            value={jarvisMethod}
                            onChange={(e) => setJarvisMethod(e.target.value)}
                            className="w-full bg-[#121215] border border-[#27272a] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                          >
                            {PAYMENT_METHODS.map((p) => (
                              <option key={p} value={p} className="bg-[#121215]">
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingJarvis(false)}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleAddToJarvis}
                          disabled={addingToJarvis}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition disabled:opacity-50 cursor-pointer"
                        >
                          {addingToJarvis ? 'Agregando...' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
