import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { handleTelegramMessage, type TgMessage } from '@/lib/telegram-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Telegram bot webhook (registered from Settings → Telegram → "Ботту иштетүү").
 * Verified with the secret token passed to setWebhook. Always answers 200 so Telegram doesn't retry.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });
  const update = (await req.json().catch(() => null)) as { message?: TgMessage } | null;
  if (update?.message) {
    try { await handleTelegramMessage(admin, update.message); }
    catch (e) { console.error('telegram_error', e instanceof Error ? e.message : e); }
  }
  return NextResponse.json({ ok: true });
}
