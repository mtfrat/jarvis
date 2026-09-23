import type { Update } from 'grammy/types';
import { bot } from '@/bot/bot';
import { NextResponse, after } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secretToken) {
  console.warn(
    '⚠️ TELEGRAM_WEBHOOK_SECRET no está definido: el webhook de Telegram se acepta sin verificar.'
  );
}

// Dedupe best-effort de reentregas de Telegram (misma instancia warm)
const seenUpdates = new Map<number, number>();
const SEEN_TTL_MS = 5 * 60 * 1000;

function isRedelivery(updateId: number): boolean {
  const now = Date.now();
  for (const [id, ts] of seenUpdates) {
    if (now - ts > SEEN_TTL_MS) seenUpdates.delete(id);
  }
  if (seenUpdates.has(updateId)) return true;
  seenUpdates.set(updateId, now);
  return false;
}

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 503 });
  }

  if (secretToken && req.headers.get('x-telegram-bot-api-secret-token') !== secretToken) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let update: Update;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof update?.update_id !== 'number') {
    return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
  }

  if (isRedelivery(update.update_id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  after(async () => {
    try {
      if (!bot.isInited()) {
        await bot.init();
      }
      await bot.handleUpdate(update);
    } catch (error) {
      console.error('Error handling Telegram update:', error);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return new Response('Telegram webhook endpoint active', { status: 200 });
}
