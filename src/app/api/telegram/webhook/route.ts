import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * Telegram bot webhook. Links a chat to a business when the owner sends
 * "/start <CODE>" (code generated in Settings → Telegram). Verified with the
 * secret token configured via setWebhook(secret_token=TELEGRAM_WEBHOOK_SECRET).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });
  const update = await req.json().catch(() => null) as { message?: { chat?: { id?: number }; text?: string } } | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text?.trim() ?? '';
  if (!chatId) return NextResponse.json({ ok: true });

  const m = text.match(/^\/start\s+([A-F0-9]{10})$/i);
  if (!m) {
    await sendTelegram(String(chatId), 'BizPro AI: Settings → Telegram → /start CODE');
    return NextResponse.json({ ok: true });
  }
  const { data: biz } = await admin.from('businesses').select('id,name').eq('telegram_link_code', m[1].toUpperCase()).maybeSingle();
  if (!biz) { await sendTelegram(String(chatId), '❌ Code not found / Код не найден / Код табылган жок'); return NextResponse.json({ ok: true }); }
  await admin.from('businesses').update({ telegram_chat_id: String(chatId), telegram_link_code: null, report_channel: 'telegram' }).eq('id', biz.id);
  await sendTelegram(String(chatId), `✅ BizPro AI — ${biz.name}`);
  return NextResponse.json({ ok: true });
}
