import 'server-only';
// Telegram AI agent: the business owner talks to the same Coordinator + agents from Telegram.
// Security: only a private chat linked by the OWNER (one-time code from Settings) is answered,
// and every query is pinned to that one business_id through the whitelisted analytics functions.
import { coordinate, detectLang } from './ai/coordinator';
import { getLlm } from './ai/llm';
import type { AgentContext } from './ai/types';
import { todayIn } from './dates';
import { dict } from './i18n';
import { buildDailyReport, type DailyReportData } from './reports/daily';
import { supabaseAdmin } from './supabase/admin';
import { serviceDataPort } from './supabase/service-port';
import { sendTelegram } from './telegram';
import type { Business, Lang } from './types';

type Admin = NonNullable<ReturnType<typeof supabaseAdmin>>;
export interface TgMessage { chat?: { id?: number; type?: string }; text?: string; voice?: unknown; photo?: unknown; from?: { id?: number } }

const HELP: Record<Lang, string> = {
  ky: '🤖 BizPro AI — сиздин AI командаңыз.\n\nСуроо жазыңыз, мисалы:\n• Бүгүн канча киреше түштү?\n• Бүгүнкү таза пайдам канча?\n• Кампада эмне аз калды?\n• Кайсы кызматкер көп сатты?\n• Бул айда бизнесим кандай иштеди?\n\nБуйруктар:\n/report — бүгүнкү отчет\n/help — жардам',
  uz: '🤖 BizPro AI — sizning AI jamoangiz.\n\nSavol yozing, masalan:\n• Bugun qancha tushum boʻldi?\n• Bugungi sof foydam qancha?\n• Omborda nima kam qoldi?\n• Qaysi xodim koʻp sotdi?\n• Bu oy biznesim qanday ishladi?\n\nBuyruqlar:\n/report — bugungi hisobot\n/help — yordam',
  ru: '🤖 BizPro AI — ваша AI-команда.\n\nНапишите вопрос, например:\n• Сколько выручки сегодня?\n• Какая чистая прибыль сегодня?\n• Что заканчивается на складе?\n• Кто из сотрудников продал больше?\n• Как работал бизнес в этом месяце?\n\nКоманды:\n/report — отчёт за сегодня\n/help — помощь',
};
const NOT_LINKED = '🔗 BizPro AI\n\nKG: Сайтта Жөндөөлөр → Telegram → «Telegram туташтыруу» басып, берилген /start КОД буйругун жөнөтүңүз.\nUZ: Saytda Sozlamalar → Telegram → «Telegramni ulash», keyin /start KOD yuboring.\nRU: На сайте Настройки → Telegram → «Подключить Telegram», затем отправьте /start КОД.';
const TEXT_ONLY: Record<Lang, string> = { ky: '✍️ Азырынча текст менен жазыңыз.', uz: '✍️ Hozircha matn bilan yozing.', ru: '✍️ Пока пишите текстом.' };
const LIMIT: Record<Lang, string> = { ky: '⏳ Суроо өтө көп. Бир мүнөт күтүңүз.', uz: '⏳ Soʻrovlar juda koʻp. Bir daqiqa kuting.', ru: '⏳ Слишком много запросов. Подождите минуту.' };
const LINKED = (name: string) => `✅ BizPro AI — «${name}» туташты / ulandi / подключено.\n\n` + HELP.ky;

export async function sendTyping(chatId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => undefined);
}

const BIZ_COLS = 'id,name,type,modules,currency,language,timezone,allow_negative_stock,report_time,report_channel,telegram_chat_id,agent_settings,created_by';

export async function handleTelegramMessage(admin: Admin, msg: TgMessage): Promise<void> {
  const chatId = msg.chat?.id ? String(msg.chat.id) : '';
  if (!chatId) return;
  if (msg.chat?.type && msg.chat.type !== 'private') return; // never answer business questions in groups
  const text = (msg.text ?? '').trim();

  // 1. Linking: "/start CODE" (code is created only by the owner in Settings)
  const link = text.match(/^\/start\s+([A-F0-9]{10})$/i);
  if (link) {
    const { data: biz } = await admin.from('businesses').select('id,name').eq('telegram_link_code', link[1].toUpperCase()).maybeSingle();
    if (!biz) { await sendTelegram(chatId, '❌ Код табылган жок / Kod topilmadi / Код не найден'); return; }
    await admin.from('businesses').update({ telegram_chat_id: chatId, telegram_link_code: null, report_channel: 'telegram' }).eq('id', biz.id);
    await sendTelegram(chatId, LINKED(biz.name));
    return;
  }

  // 2. Which business is this chat linked to?
  const { data: list } = await admin.from('businesses').select(BIZ_COLS).eq('telegram_chat_id', chatId).order('created_at', { ascending: false }).limit(1);
  const business = (list?.[0] ?? null) as (Business & { created_by: string }) | null;
  if (!business) { await sendTelegram(chatId, NOT_LINKED); return; }
  const lang: Lang = text ? detectLang(text, business.language) : business.language;

  if (!text) { await sendTelegram(chatId, TEXT_ONLY[lang]); return; }
  if (/^\/(start|help)\b/i.test(text)) { await sendTelegram(chatId, HELP[lang]); return; }

  // 3. Rate limit: 20 questions per minute per business
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from('ai_messages').select('id', { count: 'exact', head: true })
    .eq('business_id', business.id).eq('role', 'user').gte('created_at', since);
  if ((count ?? 0) >= 20) { await sendTelegram(chatId, LIMIT[lang]); return; }

  await sendTyping(chatId);
  const port = serviceDataPort(admin);

  // 4. /report → today's daily report
  if (/^\/report\b/i.test(text)) {
    const date = todayIn(business.timezone);
    const { data, error } = await admin.rpc('fn_daily_report', { p_business: business.id, p_date: date });
    if (error) { await sendTelegram(chatId, dict(lang).errors.generic); return; }
    await sendTelegram(chatId, await buildDailyReport(data as DailyReportData, port, business.modules, business.timezone, lang));
    return;
  }

  // 5. Any other text → the AI Coordinator and its agents (owner permissions, this business only)
  const ctx: AgentContext = {
    businessId: business.id, businessName: business.name, businessType: business.type, modules: business.modules,
    currency: business.currency, lang, timezone: business.timezone, role: 'owner',
    perms: { add_expenses: true, view_finance: true, delete_records: true, manage_inventory: true, record_production: true, edit_prices: true },
    disabledAgents: business.agent_settings?.disabled ?? [], data: port, t: dict(lang),
  };
  const result = await coordinate(ctx, text.slice(0, 1000), { llm: getLlm() });
  const agents = [...new Set(result.reports.map((r) => r.agent))].map((a) => ctx.t.agent[a]).join(', ');
  await sendTelegram(chatId, result.answer + (agents ? `\n\n🤖 ${agents}` : ''));

  // 6. Keep a history (same tables as the web chat), owned by the business owner
  const owner = business.created_by;
  if (owner) {
    let { data: conv } = await admin.from('ai_conversations').select('id').eq('business_id', business.id).eq('user_id', owner).eq('title', 'Telegram').maybeSingle();
    if (!conv) conv = (await admin.from('ai_conversations').insert({ business_id: business.id, user_id: owner, title: 'Telegram' }).select('id').single()).data;
    if (conv) {
      await admin.from('ai_messages').insert([
        { business_id: business.id, conversation_id: conv.id, user_id: owner, role: 'user', content: text.slice(0, 1000) },
        { business_id: business.id, conversation_id: conv.id, user_id: owner, role: 'assistant', content: result.answer.slice(0, 8000),
          agents: result.reports.map((r) => r.agent), data: { mode: result.mode, source: 'telegram', warnings: result.warnings } },
      ]);
    }
  }
}
