import { webhookCallback } from 'grammy';
import { bot } from '@/bot/bot';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const handler = webhookCallback(bot, 'std/http');

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 503 });
  }
  return handler(req);
}

export async function GET() {
  return new Response('Telegram webhook endpoint active', { status: 200 });
}
