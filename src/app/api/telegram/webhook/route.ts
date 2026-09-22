import { webhookCallback } from 'grammy';
import { bot } from '@/bot/bot';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secretToken) {
  console.warn(
    '⚠️ TELEGRAM_WEBHOOK_SECRET no está definido: el webhook de Telegram se acepta sin verificar.'
  );
}
const handler = webhookCallback(bot, 'std/http', secretToken ? { secretToken } : undefined);

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 503 });
  }
  return handler(req);
}

export async function GET() {
  return new Response('Telegram webhook endpoint active', { status: 200 });
}
