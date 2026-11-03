'use server';
import { isIsoDate } from '../dates';
import { buildDailyReport, type DailyReportData } from '../reports/daily';
import { supabaseDataPort } from '../supabase/data-port';
import { sendTelegram } from '../telegram';
import { run, unwrap } from './_run';

export async function generateDailyReport(date: string, send = false) {
  return run(async (ctx, sb) => {
    if (!ctx.perms.view_finance) throw new Error('finance_forbidden');
    const d = isIsoDate(date) && date <= ctx.today ? date : ctx.today;
    const data = unwrap(await sb.rpc('fn_daily_report', { p_business: ctx.business.id, p_date: d })) as DailyReportData;
    const text = await buildDailyReport(data, supabaseDataPort(sb), ctx.business.modules, ctx.business.timezone, ctx.lang);
    let sent = false;
    if (send) {
      if (!ctx.business.telegram_chat_id) throw new Error('msg:' + ctx.t.settings.tgConnect);
      sent = await sendTelegram(ctx.business.telegram_chat_id, text);
      if (!sent) throw new Error('msg:' + ctx.t.settings.tgNotConfigured);
    }
    return { text, sent };
  });
}
