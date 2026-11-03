import { NextResponse, type NextRequest } from 'next/server';
import { todayIn } from '@/lib/dates';
import { buildDailyReport, type DailyReportData } from '@/lib/reports/daily';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { serviceDataPort } from '@/lib/supabase/service-port';
import { sendTelegram } from '@/lib/telegram';
import type { Lang, ModuleId } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly cron (see vercel.json). For every business whose local report hour is now,
 * builds the daily report once (unique per business/date) and delivers it.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'service key missing' }, { status: 500 });
  const force = req.nextUrl.searchParams.get('business');

  const { data: businesses, error } = await admin.from('businesses').select('id,name,timezone,report_time,report_channel,telegram_chat_id,language,modules').neq('report_channel', 'none');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const port = serviceDataPort(admin);
  const results: { id: string; status: string }[] = [];
  for (const b of businesses ?? []) {
    if (force && b.id !== force) continue;
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: b.timezone, hour: '2-digit', hour12: false }).format(new Date());
    if (!force && hour !== String(b.report_time).slice(0, 2)) continue;
    const date = todayIn(b.timezone);
    const { data: existing } = await admin.from('daily_reports').select('id,delivered_at').eq('business_id', b.id).eq('report_date', date).maybeSingle();
    if (existing?.delivered_at && !force) { results.push({ id: b.id, status: 'already_sent' }); continue; }
    try {
      const { data, error: e } = await admin.rpc('fn_daily_report', { p_business: b.id, p_date: date });
      if (e) throw new Error(e.message);
      const texts: Record<Lang, string> = { ky: '', uz: '', ru: '' };
      for (const l of ['ky', 'uz', 'ru'] as Lang[]) texts[l] = await buildDailyReport(data as DailyReportData, port, b.modules as ModuleId[], b.timezone, l);
      let delivered: string | null = null;
      if (b.report_channel === 'telegram' && b.telegram_chat_id) {
        delivered = (await sendTelegram(b.telegram_chat_id, texts[b.language as Lang] ?? texts.ky)) ? 'telegram' : null;
      } else if (b.report_channel === 'in_app') delivered = 'in_app';
      await admin.from('daily_reports').upsert({
        business_id: b.id, report_date: date, data, text_ky: texts.ky, text_uz: texts.uz, text_ru: texts.ru,
        delivered_via: delivered, delivered_at: delivered ? new Date().toISOString() : null,
      }, { onConflict: 'business_id,report_date' });
      results.push({ id: b.id, status: delivered ?? 'saved' });
    } catch (err) {
      results.push({ id: b.id, status: 'error: ' + (err instanceof Error ? err.message.slice(0, 80) : 'unknown') });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
