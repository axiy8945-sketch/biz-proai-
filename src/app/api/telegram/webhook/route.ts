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
  const admin = supabaseAdmin();
  const header = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!admin || header.length < 16) return NextResponse.json({ ok: false }, { status: 401 });
  // Per-business bot (token saved in Settings) or the platform bot from env vars.
  let bot: { business_id: string | null; token?: string } | null = null;
  const { data: own } = await admin.from('telegram_bots').select('business_id,token').eq('secret', header).maybeSingle();
  if (own) bot = own;
  else if (header === process.env.TELEGRAM_WEBHOOK_SECRET?.trim()) bot = { business_id: null };
  if (!bot) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await req.json().catch(() => null)) as { message?: TgMessage } | null;
  if (update?.message) {
    try { await handleTelegramMessage(admin, update.message, bot); }
    catch (e) { console.error('telegram_error', e instanceof Error ? e.message : e); }
  }
  return NextResponse.json({ ok: true });
}
