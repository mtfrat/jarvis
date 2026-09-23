import { Bot } from 'grammy';
import { parseExpenseFromText, parseExpenseFromAudio, parseExpenseFromImage } from '../lib/gemini';
import {
  createExpense,
  getDashboardStats,
  getExpenses,
  getExpenseByPrefix,
  updateExpense,
  setExpenseDiscount,
  deleteExpense,
  deleteInstallmentGroup,
} from '../lib/expense-service';
import { isSupabaseConfigured } from '../lib/supabase';
import { format } from 'date-fns';

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
    `📊 *Resumen:* Escribí _/resumen_ y te cuento cómo viene el mes (gastos, racha, proyección y balance).\n` +
    `🧾 *Gastos del mes:* _/gastos_ — lista con IDs cortos para editar o borrar.\n` +
    `✏️ *Corregir:* _/editar 2aee2d45 monto 15000_ (campos: monto, desc, cat, pago, fecha)\n` +
    `🗑️ *Borrar:* _/borrar 2aee2d45_ — con confirmación.\n` +
    `🏷️ *Descuento:* _/descuento 2aee2d45 2000_ — registrá lo que ahorraste.\n` +
    `📈 *Dashboard:* _/dashboard_ — botón al panel web.\n\n` +
    `Tu Telegram ID es: \`${ctx.from?.id}\``;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// Command: /resumen — quick month status
bot.command('resumen', async (ctx) => {
  if (!isSupabaseConfigured) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nCompletá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.replyWithChatAction('typing');
  try {
    const stats = await getDashboardStats();
    const fmt = (ars: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);

    const lines = [
      '📊 *Resumen del mes*',
      `💰 Gastado: ${fmt(stats.totalSpentArs)}`,
      stats.previousMonthComparisonPercent !== null
        ? `${stats.previousMonthComparisonPercent <= 0 ? '🟢' : '🔴'} ${Math.abs(stats.previousMonthComparisonPercent)}% ${stats.isCurrentMonth ? 'vs mes anterior a esta fecha' : 'vs mes anterior'}`
        : null,
      stats.projectedMonthTotalArs !== null
        ? `🎯 Proyección de cierre: ${fmt(stats.projectedMonthTotalArs)}`
        : null,
      `🔥 Racha sin gastos: ${stats.streakDaysWithoutSpending ?? 0} días`,
      `⚖️ Balance: ${fmt(stats.balanceArs)} (ingresos ${fmt(stats.totalIncomeArs)})`,
      stats.totalDiscountArs > 0 ? `💸 Ahorraste en descuentos: ${fmt(stats.totalDiscountArs)}` : null,
      stats.topCategory ? `📂 Mayor categoría: ${stats.topCategory.category} (${stats.topCategory.percentage}%)` : null,
      stats.futureInstallmentsTotalArs > 0 ? `📅 Cuotas comprometidas6m: ${fmt(stats.futureInstallmentsTotalArs)}` : null,
      stats.budgetsExceeded.length > 0
        ? `🚨 Presupuestos excedidos: ${stats.budgetsExceeded.join(', ')}`
        : null,
    ].filter(Boolean);

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error building /resumen:', error);
    await ctx.reply('❌ No pude armar el resumen. Probá de nuevo en un momento.');
  }
});

// Helper: Format expense registered response
function formatExpenseResponse(data: {
  amount: number;
  currency: string;
  description: string;
  category: string;
  payment_method: string;
  installments_total: number;
  discount_amount?: number;
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

  if (data.discount_amount && data.discount_amount > 0) {
    const formattedDiscount = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: data.currency,
    }).format(data.discount_amount);
    const formattedOriginal = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: data.currency,
    }).format(data.amount + data.discount_amount);
    response += `\n🏷️ *Descuento:* -${formattedDiscount} (original ${formattedOriginal})`;
  }

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

function discountFrom(parsed: { amount: number; original_amount?: number }): number {
  return parsed.original_amount && parsed.original_amount > parsed.amount
    ? Math.round((parsed.original_amount - parsed.amount) * 100) / 100
    : 0;
}

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://jarvis-phi-one-38.vercel.app';

// Command: /dashboard — button to the web panel
bot.command('dashboard', async (ctx) => {
  await ctx.reply('📈 Abrí tu dashboard:', {
    reply_markup: {
      inline_keyboard: [[{ text: '📈 Jarvis Finance ↗', url: DASHBOARD_URL }]],
    },
  });
});

// Command: /gastos — list current-month expenses with short IDs
bot.command('gastos', async (ctx) => {
  if (!isSupabaseConfigured) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nCompletá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.replyWithChatAction('typing');
  try {
    const month = format(new Date(), 'yyyy-MM');
    const expenses = await getExpenses({ month });
    if (expenses.length === 0) {
      await ctx.reply('No hay gastos este mes todavía.');
      return;
    }

    const fmt = (ars: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);

    const shown = expenses.slice(0, 20);
    const lines = shown.map((e, i) =>
      `${i + 1}. \`${e.id.slice(0, 8)}\` · ${e.description} · ${fmt(Number(e.amount_ars))} · ${e.category}`
    );
    if (expenses.length > shown.length) {
      lines.push(`… y ${expenses.length - shown.length} más`);
    }
    lines.push('', 'Usá el ID para /editar, /borrar o /descuento.');

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error building /gastos:', error);
    await ctx.reply('❌ No pude listar los gastos. Probá de nuevo en un momento.');
  }
});

// Command: /editar <id> <campo> <valor>
bot.command('editar', async (ctx) => {
  if (!isSupabaseConfigured) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nCompletá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const args = String(ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 3) {
    await ctx.reply(
      '✏️ *Uso:* `/editar <id> <campo> <valor>`\n' +
      'Campos: `monto`, `desc`, `cat`, `pago`, `fecha`\n' +
      'Ej: `/editar 2aee2d45 monto 15000`\n' +
      'Los IDs están en /gastos.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [shortId, rawField, ...valueParts] = args;
  const value = valueParts.join(' ');
  const fieldKey = rawField.toLowerCase();

  const fieldMap: Record<string, 'amount' | 'description' | 'category' | 'payment_method' | 'date'> = {
    monto: 'amount',
    amount: 'amount',
    desc: 'description',
    descripcion: 'description',
    descripción: 'description',
    description: 'description',
    cat: 'category',
    categoria: 'category',
    categoría: 'category',
    category: 'category',
    pago: 'payment_method',
    metodo: 'payment_method',
    método: 'payment_method',
    payment: 'payment_method',
    fecha: 'date',
    date: 'date',
  };

  const field = fieldMap[fieldKey];
  if (!field) {
    await ctx.reply(
      '✏️ Campo inválido. Opciones: `monto`, `desc`, `cat`, `pago`, `fecha`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.replyWithChatAction('typing');
  try {
    const exp = await getExpenseByPrefix(shortId);
    if (!exp) {
      await ctx.reply('🔍 No encontré un gasto con ese ID. Mirá los IDs en /gastos.');
      return;
    }

    const fields: Parameters<typeof updateExpense>[1] = {};
    if (field === 'amount') {
      let s = value.replace(/[^\d.,]/g, '');
      if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
        s = s.replace(/\./g, '');
      }
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error('Monto inválido: usá un número como 15000 o 15000,50.');
      fields.amount = n;
    } else if (field === 'description') {
      fields.description = value;
    } else if (field === 'category') {
      fields.category = value;
    } else if (field === 'payment_method') {
      fields.payment_method = value;
    } else if (field === 'date') {
      fields.date = value;
    }

    const updated = await updateExpense(exp.id, fields);
    const fmt = (ars: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);

    await ctx.reply(
      `✅ Actualizado:\n\`${updated.id.slice(0, 8)}\` · ${updated.description} · ${fmt(Number(updated.amount_ars))} · ${updated.category}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error updating expense:', error);
    await ctx.reply(`❌ ${error instanceof Error ? error.message : 'No pude editar el gasto.'}`);
  }
});

// Command: /borrar <id> — with inline confirmation
bot.command('borrar', async (ctx) => {
  if (!isSupabaseConfigured) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nCompletá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const shortId = String(ctx.match ?? '').trim();
  if (!shortId) {
    await ctx.reply('🗑️ *Uso:* `/borrar <id>`\nLos IDs están en /gastos.', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.replyWithChatAction('typing');
  try {
    const exp = await getExpenseByPrefix(shortId);
    if (!exp) {
      await ctx.reply('🔍 No encontré un gasto con ese ID. Mirá los IDs en /gastos.');
      return;
    }

    const isGroup = Boolean(exp.installment_group_id);
    const msg = isGroup
      ? `¿Borrar "${exp.description}" (${exp.installments_total} cuotas) y TODAS sus cuotas?`
      : `¿Borrar "${exp.description}" por ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(exp.amount_ars))}?`;

    await ctx.reply(msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🗑️ Sí, borrar', callback_data: `del:${exp.id}` }],
          [{ text: '✕ No', callback_data: 'delno' }],
        ],
      },
    });
  } catch (error) {
    console.error('Error preparing delete:', error);
    await ctx.reply('❌ No pude preparar el borrado.');
  }
});

// Callback: confirmation for /borrar
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data || '';
  await ctx.answerCallbackQuery().catch(() => {});

  if (data.startsWith('del:')) {
    const fullId = data.slice(4);
    const exp = await getExpenseByPrefix(fullId);
    if (!exp) {
      await ctx.editMessageText('🔍 Ese gasto ya no existe.');
      return;
    }
    let ok: boolean;
    if (exp.installment_group_id) {
      ok = await deleteInstallmentGroup(exp.installment_group_id);
    } else {
      ok = await deleteExpense(exp.id);
    }
    await ctx.editMessageText(ok ? '🗑️ Borrado.' : '❌ No pude borrar el gasto.');
    return;
  }

  if (data === 'delno') {
    await ctx.editMessageText('👌 No borré nada.');
  }
});

// Command: /descuento <id> <monto>
bot.command('descuento', async (ctx) => {
  if (!isSupabaseConfigured) {
    await ctx.reply(
      '⚠️ *Base de datos no configurada*\n\nCompletá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const args = String(ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) {
    await ctx.reply(
      '🏷️ *Uso:* `/descuento <id> <monto>`\nEj: `/descuento 2aee2d45 2000`\nLos IDs están en /gastos.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [shortId, rawAmount] = args;
  await ctx.replyWithChatAction('typing');
  try {
    const exp = await getExpenseByPrefix(shortId);
    if (!exp) {
      await ctx.reply('🔍 No encontré un gasto con ese ID. Mirá los IDs en /gastos.');
      return;
    }

    let s = rawAmount.replace(/[^\d.,]/g, '');
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error('Monto inválido: usá un número como 2000 o 2000,50.');

    const updated = await setExpenseDiscount(exp.id, n);
    const fmt = (ars: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);

    await ctx.reply(
      `🏷️ *Descuento registrado*\n\n\`${updated.id.slice(0, 8)}\` · ${updated.description}\nAhorro: ${fmt(Number(updated.discount_ars))}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error setting discount:', error);
    await ctx.reply(`❌ ${error instanceof Error ? error.message : 'No pude registrar el descuento.'}`);
  }
});

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
    const discount = discountFrom(parsed);

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      discount_amount: discount,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_voice',
      raw_input: '[Nota de voz procesada]',
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse({ ...parsed, discount_amount: discount }), { parse_mode: 'Markdown' });
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
    const discount = discountFrom(parsed);

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      discount_amount: discount,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_receipt',
      raw_input: '[Foto de ticket]',
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse({ ...parsed, discount_amount: discount }), { parse_mode: 'Markdown' });
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
    const discount = discountFrom(parsed);

    await createExpense({
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      category: parsed.category,
      payment_method: parsed.payment_method,
      installments_total: parsed.installments_total,
      date: parsed.date,
      discount_amount: discount,
      user_telegram_id: ctx.from?.id,
      user_name: ctx.from?.first_name || 'Telegram User',
      source: 'telegram_text',
      raw_input: text,
      metadata: { items: parsed.items },
    });

    await ctx.reply(formatExpenseResponse({ ...parsed, discount_amount: discount }), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error processing text expense:', error);
    await ctx.reply('🤔 No pude identificar el gasto. Probá diciendo por ejemplo: _"Supermercado 14500"_ o _"Zapatillas 80000 en 3 cuotas"_', { parse_mode: 'Markdown' });
  }
});
