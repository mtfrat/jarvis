import { Bot } from 'grammy';
import { parseExpenseFromText, parseExpenseFromAudio, parseExpenseFromImage } from '../lib/gemini';
import { createExpense } from '../lib/expense-service';
import { isSupabaseConfigured } from '../lib/supabase';

const botToken = process.env.TELEGRAM_BOT_TOKEN || 'placeholder_bot_token';
export const bot = new Bot(botToken);

// Helper: Check if user is whitelisted
function isUserAuthorized(userId?: number): boolean {
  const allowedIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (allowedIds.length === 0) return false; // fail closed: sin whitelist configurada no entra nadie
  return userId ? allowedIds.includes(String(userId)) : false;
}

// Helper: Download Telegram file as Buffer
async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download file from Telegram: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Middleware: Whitelist authorization check
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!isUserAuthorized(userId)) {
    await ctx.reply(
      '⛔ *Acceso no autorizado*\n\nTu ID de Telegram (' + userId + ') no está en la lista de usuarios permitidos.\nAgrega este ID en la variable `TELEGRAM_ALLOWED_USER_IDS` de tu configuración.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  return next();
});

// Middleware: DB must be configured before doing any work (except commands like /start)
bot.use(async (ctx, next) => {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text ?? '' : '';
  if (!isSupabaseConfigured && !text.startsWith('/')) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nEl gasto NO se guardó. Completá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  return next();
});

// Command: /start
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'Amigo';
  const msg =
    `👋 *¡Hola ${name}! Soy Jarvis, tu asistente financiero.*\n\n` +
    `Podés registrar tus gastos rápidamente de tres formas:\n\n` +
    `💬 *Texto:* _"Cena 15000 pesos en efectivo"_ o _"Zapatillas 120.000 en 6 cuotas"_\n` +
    `🎙️ *Voz:* Mandame un audio diciendo en qué gastaste y cuánto.\n` +
    `📸 *Foto:* Mandame la foto de un ticket o factura de compra.\n\n` +
    `Divido automáticamente las compras en cuotas para los próximos meses y categorizo todo en tu dashboard.\n\n` +
    `Tu Telegram ID es: \`${ctx.from?.id}\``;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Helper: Format expense registered response
function formatExpenseResponse(data: {
  amount: number;
  currency: string;
  description: string;
  category: string;
  payment_method: string;
  installments_total: number;
  roast_comment?: string;
}): string {
  const formattedAmount = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: data.currency,
  }).format(data.amount);

  let response =
    `✅ *Gasto Registrado*\n\n` +
    `🏷️ *Comercio / Detalle:* ${data.description}\n` +
    `💵 *Monto:* ${formattedAmount} (${data.currency})\n` +
    `📂 *Categoría:* ${data.category}\n` +
    `💳 *Pago:* ${data.payment_method}`;

  if (data.installments_total > 1) {
    const perQuota = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: data.currency,
    }).format(data.amount / data.installments_total);
    response += `\n📅 *Plan:* ${data.installments_total} cuotas proyectadas de ${perQuota}/mes`;
  }

  if (data.roast_comment) {
    response += `\n\n💬 _"${data.roast_comment}"_`;
  }

  return response;
}

// Handler: Voice / Audio notes
bot.on(['message:voice', 'message:audio'], async (ctx) => {
  await ctx.replyWithChatAction('typing');
  try {
    const voice = ctx.message.voice || ctx.message.audio;
    if (!voice) return;

    const file = await ctx.getFile();
    if (!file.file_path) {
      await ctx.reply('❌ No pude acceder al archivo de audio de Telegram.');
      return;
    }

    const audioBuffer = await downloadTelegramFile(file.file_path);
    const parsed = await parseExpenseFromAudio(audioBuffer, voice.mime_type || 'audio/ogg');

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_voice',
      raw_input: '[Nota de voz procesada]',
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse(parsed), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error processing voice message:', error);
    await ctx.reply('❌ Ocurrió un error al procesar el audio. Por favor intenta de nuevo o escribe el gasto en texto.');
  }
});

// Handler: Photos / Receipts
bot.on('message:photo', async (ctx) => {
  await ctx.replyWithChatAction('typing');
  try {
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1]; // highest quality
    const file = await ctx.api.getFile(largestPhoto.file_id);

    if (!file.file_path) {
      await ctx.reply('❌ No pude obtener la imagen.');
      return;
    }

    const imageBuffer = await downloadTelegramFile(file.file_path);
    const mimeType = file.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const parsed = await parseExpenseFromImage(imageBuffer, mimeType);

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_receipt',
      raw_input: '[Foto de ticket]',
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse(parsed), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error processing photo:', error);
    await ctx.reply('❌ No pude interpretar los datos de ese ticket. Asegurate de que se vea nítido el total y el comercio.');
  }
});

// Handler: Text messages
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; // ignore other slash commands

  await ctx.replyWithChatAction('typing');
  try {
    const parsed = await parseExpenseFromText(text);

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_text',
      raw_input: text,
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse(parsed), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error processing text expense:', error);
    await ctx.reply('🤔 No pude identificar el gasto. Probá diciendo por ejemplo: _"Supermercado 14500"_ o _"Zapatillas 80000 en 3 cuotas"_', { parse_mode: 'Markdown' });
  }
});
