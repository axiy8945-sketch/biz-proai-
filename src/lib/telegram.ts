import 'server-only';

/** Sends a plain-text message via the Telegram Bot API (splits >4000 chars). */
export async function sendTelegram(chatId: string, text: string, botToken?: string): Promise<boolean> {
  const token = botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !chatId) return false;
  const chunks = text.match(/[\s\S]{1,3900}(\n|$)/g) ?? [text];
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    if (!res.ok) return false;
  }
  return true;
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_WEBHOOK_SECRET?.trim());
}

/** Registers this site's webhook with Telegram and the bot's command menu. Returns the bot username. */
export async function registerTelegramWebhook(origin: string, botToken?: string, botSecret?: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  const token = botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = botSecret?.trim() || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !secret) return { ok: false, error: 'not_configured' };
  const api = (m: string, body: unknown) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<{ ok: boolean; result?: { username?: string }; description?: string }>);
  const set = await api('setWebhook', { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
  if (!set.ok) return { ok: false, error: set.description ?? 'setWebhook failed' };
  await api('setMyCommands', { commands: [{ command: 'report', description: 'Бүгүнкү отчет / Hisobot / Отчёт' }, { command: 'help', description: 'Жардам / Yordam / Помощь' }] });
  const me = await api('getMe', {});
  return { ok: true, username: me.result?.username };
}

/** Validates a bot token with Telegram (getMe). */
export async function checkBotToken(token: string): Promise<string | null> {
  if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) return null;
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((x) => x.json()).catch(() => null) as { ok?: boolean; result?: { username?: string } } | null;
  return r?.ok ? r.result?.username ?? '' : null;
}
