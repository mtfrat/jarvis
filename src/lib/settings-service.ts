import { supabaseAdmin, isSupabaseConfigured } from './supabase';

export const CARD_PAYMENT_DAY_KEY = 'card_payment_day';
export const CARD_CLOSING_DAY_KEY = 'card_closing_day';
export const REMINDER_CHAT_ID_KEY = 'reminder_chat_id';
export const CARD_METHOD = 'Tarjeta Crédito';

export async function getSetting(key: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) return null;
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase no configurado: no pude guardar la configuración.');
  }
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    if (error.code === '42P01' || /relation .*settings.* does not exist/i.test(error.message)) {
      throw new Error('Falta la migración 06_settings.sql — ejecutala en Supabase SQL Editor.');
    }
    throw new Error(`No pude guardar la configuración: ${error.message}`);
  }
}

export async function deleteSetting(key: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabaseAdmin.from('settings').delete().eq('key', key);
  if (error && !/rows/i.test(error.message)) {
    throw new Error(`No pude borrar la configuración: ${error.message}`);
  }
}

/** Día del mes (1-31) en que se paga la tarjeta, o null si no está configurado. */
export async function getCardPaymentDay(): Promise<number | null> {
  const raw = await getSetting(CARD_PAYMENT_DAY_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export async function setCardPaymentDay(day: number): Promise<void> {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Día inválido: usá un número entre 1 y 31.');
  }
  await setSetting(CARD_PAYMENT_DAY_KEY, String(day));
}

/** Día de cierre de la tarjeta (1-31), o null si no está configurado. */
export async function getCardClosingDay(): Promise<number | null> {
  const raw = await getSetting(CARD_CLOSING_DAY_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

export async function setCardClosingDay(day: number): Promise<void> {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Día inválido: usá un número entre 1 y 31.');
  }
  await setSetting(CARD_CLOSING_DAY_KEY, String(day));
}

export async function getReminderChatId(): Promise<number | null> {
  const raw = await getSetting(REMINDER_CHAT_ID_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export async function setReminderChatId(chatId: number): Promise<void> {
  await setSetting(REMINDER_CHAT_ID_KEY, String(chatId));
}
