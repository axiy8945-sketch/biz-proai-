// Deterministic multilingual router (Kyrgyz, Uzbek Latin/Cyrillic, Russian, English).
// Used when no LLM is configured, and as a safety net when the LLM's plan is invalid.
import { periodFor, type Period, type PeriodKey } from '../dates';
import type { AgentId, AgentTask } from './types';

export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[ʻʼ’‘`´']/g, "'")
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

const PERIOD_RULES: [PeriodKey, RegExp][] = [
  ['yesterday', /(кечээ|вчера|kecha|(?<!\p{L})кеча(?!\p{L})|yesterday)/u],
  ['last_month', /(өткөн ай|откон ай|прошл\S* месяц|o'tgan oy|otgan oy|ўтган ой|last month)/u],
  ['last_30_days', /(30 (күн|кун|дн|kun|кун)|last 30)/u],
  ['last_7_days', /(7 (күн|кун|дн|kun)|последн\S* недел|акыркы жума|last 7|past week)/u],
  ['this_week', /(бул жума|ушул жума|эт\S* недел|bu hafta|shu hafta|бу ҳафта|this week|жумада|haftada)/u],
  ['this_month', /(бул ай|ушул ай|эт\S* месяц|bu oy|shu oy|бу ой|this month|(?<!\p{L})(айда|oyda)(?!\p{L})|месяц)/u],
  ['today', /(бүгүн|бугун|сегодня|bugun|бугун|today|азыр|hozir)/u],
];

type Rule = { agent: AgentId; intent: string; re: RegExp };
const RULES: Rule[] = [
  { agent: 'analyst', intent: 'performance', re: /(кандай иштеди|кандай болду|как (работал|прош|идут дела)|qanday ishladi|qanday o'tdi|анализ|талда|tahlil|итог|кеңеш|совет|maslahat|жакшырт|улучш|yaxshila|how (did|is) .*business|advice|improve)/u },
  { agent: 'inventory', intent: 'restock', re: /(сатып алыш|кайра сатып|докуп|закупить|заказать|что купить|xarid qil|qayta sotib|sotib olish|restock|reorder|what to buy)/u },
  { agent: 'inventory', intent: 'low_stock', re: /(аз калд|түгөн|тугон|кампа|склад|остат|заканчива|kam qol|ombor|qoldiq|tugay|low stock|in stock|stock)/u },
  { agent: 'employee', intent: 'activity', re: /(активн|аракет|faoliyat|журнал|activity|кто (что )?(изменил|удалил))/u },
  { agent: 'employee', intent: 'sales_by_employee', re: /(кызматкер|сотрудник|продав|xodim|sotuvchi|employee|staff|кто .*прода|ким .*сат|kim .*sot)/u },
  { agent: 'production', intent: 'summary', re: /(өндүрүш|ондуруш|произв|ishlab chiqar|партия|сырь|чийки зат|xomashyo|рецепт|retsept|ингредиент|ingredient|испекл|бышыр|pishir|production|batch)/u },
  { agent: 'finance', intent: 'expenses', re: /(чыгаша|расход|затрат|xarajat|harajat|expense|cost)/u },
  { agent: 'finance', intent: 'profit', re: /(пайда|прибыл|foyda|profit|маржа|margin|заработ|таза|sof|net)/u },
  { agent: 'sales', intent: 'top_products', re: /(кайсы товар|көп сатыл|коп сатыл|эң көп|топ|лучше всего|самый продаваем|популяр|qaysi tovar|ko'p sotil|eng ko'p|best.?sell|top product|what sold)/u },
  { agent: 'sales', intent: 'trend', re: /(тренд|динамик|салыштыр|сравн|solishtir|өсүш|рост|o'sish|kamay|азай|упал|снизил|trend|compare|growth)/u },
  { agent: 'sales', intent: 'revenue', re: /(киреше|кирше|выручк|доход|сатуу|сатты|продаж|продал|tushum|daromad|savdo|sotdi|revenue|sales|income|канча сат|сколько)/u },
];

const DEFAULT_PERIOD: Record<string, PeriodKey> = {
  'sales.revenue': 'today', 'sales.trend': 'last_7_days', 'sales.top_products': 'this_month',
  'finance.profit': 'today', 'finance.expenses': 'this_month', 'finance.summary': 'this_month',
  'employee.sales_by_employee': 'this_month', 'employee.activity': 'last_7_days',
  'production.summary': 'today', 'analyst.performance': 'this_month',
  'inventory.low_stock': 'today', 'inventory.restock': 'today', 'inventory.product_stock': 'today', 'inventory.value': 'today',
};

export function detectPeriod(text: string): PeriodKey | null {
  const n = normalize(text);
  for (const [key, re] of PERIOD_RULES) if (re.test(n)) return key;
  return null;
}

export function extractQuoted(text: string): string | undefined {
  const m = text.match(/[«"“]([^»"”]{2,60})[»"”]/);
  return m?.[1]?.trim();
}

/** Returns an ordered, de-duplicated task list. Empty list = question not understood. */
export function routeQuestion(text: string, timezone: string, now?: Date): AgentTask[] {
  const n = normalize(text);
  const explicit = detectPeriod(n);
  const tasks: AgentTask[] = [];
  const seen = new Set<string>();
  const add = (agent: AgentId, intent: string, product?: string) => {
    const k = `${agent}.${intent}`;
    if (seen.has(k)) return;
    seen.add(k);
    const period: Period = periodFor(explicit ?? DEFAULT_PERIOD[k] ?? 'today', timezone, now);
    tasks.push({ agent, intent, period, ...(product ? { product } : {}) });
  };

  const product = extractQuoted(text);
  let matched = RULES.filter((r) => r.re.test(n));
  const has = (a: AgentId, i?: string) => matched.some((r) => r.agent === a && (!i || r.intent === i));
  // Generic words ("sold", "which product") yield to more specific intents.
  if (has('inventory', 'restock')) matched = matched.filter((r) => !(r.agent === 'sales' && r.intent === 'top_products') && !(r.agent === 'inventory' && r.intent === 'low_stock'));
  if (matched.some((r) => r.agent !== 'sales' || r.intent !== 'revenue')) matched = matched.filter((r) => !(r.agent === 'sales' && r.intent === 'revenue'));
  if (has('employee', 'sales_by_employee')) matched = matched.filter((r) => !(r.agent === 'sales' && r.intent === 'top_products'));

  for (const rule of matched) {
    if (rule.agent === 'analyst') {
      // Holistic question: the coordinator gathers the core facts first, then the analyst.
      add('finance', 'summary'); add('sales', 'revenue'); add('sales', 'top_products'); add('inventory', 'low_stock'); add('analyst', 'performance');
    } else if (rule.agent === 'inventory' && product && rule.intent === 'low_stock') {
      add('inventory', 'product_stock', product);
    } else {
      add(rule.agent, rule.intent);
    }
  }
  // "Profit" questions are about money: also show revenue context only if nothing else asked.
  if (!tasks.length && explicit) { add('sales', 'revenue'); add('finance', 'profit'); }
  if (!tasks.length && product) add('inventory', 'product_stock', product);
  return tasks;
}
