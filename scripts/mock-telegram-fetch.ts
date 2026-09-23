import type { Update } from 'grammy/types';

export type Sent = { method: string; payload: Record<string, unknown> };

export const sent: Sent[] = [];

function fakeResult(method: string, payload: Record<string, unknown>): unknown {
  if (method === 'getMe') {
    return {
      id: 1,
      is_bot: true,
      first_name: 'JarvisTest',
      username: 'jarvis_test_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    };
  }
  if (method === 'sendMessage') {
    return {
      message_id: sent.length || 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(payload.chat_id ?? 123), type: 'private', first_name: 'T' },
      text: String(payload.text ?? ''),
    };
  }
  if (method === 'editMessageText') {
    return {
      message_id: Number(payload.message_id ?? 1),
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(payload.chat_id ?? 123), type: 'private', first_name: 'T' },
      text: String(payload.text ?? ''),
    };
  }
  if (method === 'getFile') {
    return { file_id: 'x', file_unique_id: 'y', file_path: 'fake' };
  }
  return true;
}

/** Short-circuits every Telegram API call before it hits the network. */
export function installTelegramMock(api: { config: { use: (...args: any[]) => unknown } }): void {
  api.config.use(async (_prev: unknown, method: string, payload?: Record<string, unknown>) => {
    const p = payload ?? {};
    sent.push({ method, payload: p });
    return { ok: true, result: fakeResult(method, p) };
  });
}

export function commandEntities(text: string): NonNullable<Update['message']>['entities'] {
  const cmd = text.split(/\s+/)[0] || text;
  return [{ type: 'bot_command', offset: 0, length: cmd.length }];
}
