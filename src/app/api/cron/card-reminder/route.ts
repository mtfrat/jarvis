import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getCardPaymentDay, getReminderChatId, CARD_METHOD } from '@/lib/settings-service';

export const dynamic = 'force-dynamic';

// Argentina sin DST → UTC-3. 14:00 ART = 17:00 UTC → cron "0 17 * * *"
function artNow(): { year: number; month: number; day: number } {
  const art = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { year: art.getUTCFullYear(), month: art.getUTCMonth() + 1, day: art.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization') || '';
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const paymentDay = await getCardPaymentDay();
    if (!paymentDay) {
      return NextResponse.json({ ok: true, skipped: 'payment_day_not_configured' });
    }

    const { year, month, day } = artNow();
    // Clamp: si hoy es 31 pero el mes tiene 30, se considera "último día" = día de pago
    const effectiveDay = Math.min(paymentDay, daysInMonth(year, month));
    if (day !== effectiveDay) {
      return NextResponse.json({ ok: true, skipped: 'not_payment_day', today: day, expected: effectiveDay });
    }

    const chatId = await getReminderChatId();
    if (!chatId) {
      return NextResponse.json({ ok: true, skipped: 'no_reminder_chat' });
    }

    // Total tarjeta del mes anterior (fecha de compra original en M-1)
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const start = `${prev.y}-${String(prev.m).padStart(2, '0')}-01`;
    const end = `${prev.y}-${String(prev.m).padStart(2, '0')}-${String(daysInMonth(prev.y, prev.m)).padStart(2, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('amount_ars')
      .eq('payment_method', CARD_METHOD)
      .gte('date', start)
      .lte('date', end);

    if (error) {
      console.error('cron card-reminder: fetch error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalArs = (data || []).reduce((sum, r) => sum + Number(r.amount_ars), 0);
    const fmt = (ars: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);

    const monthName = new Date(Date.UTC(prev.y, prev.m - 1, 1)).toLocaleDateString('es-AR', {
      month: 'long',
      timeZone: 'UTC',
    });

    const text =
      `💳 *Recordatorio: pago de tarjeta*\n\n` +
      `Hoy es día ${effectiveDay}: vence el pago de tu tarjeta.\n` +
      `🧾 *Gastos con tarjeta de ${monthName}:* ${fmt(totalArs)}\n` +
      (totalArs === 0
        ? '_No hubo gastos con tarjeta ese mes._'
        : '_Revisá tu dashboard para el detalle._');

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📈 Abrir dashboard', url: 'https://jarvis-phi-one-38.vercel.app' }]],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('cron card-reminder: telegram error', res.status, body);
      return NextResponse.json({ error: `Telegram ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: true, chatId, totalArs, effectiveDay });
  } catch (err) {
    console.error('cron card-reminder error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
