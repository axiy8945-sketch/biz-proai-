// Renders every screen to static HTML with real figures from the local test DB.
// Run: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tsx --tsconfig tests/render/tsconfig.json tests/render/render.tsx <outDir>
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ReactNS from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Chat, type ChatMessage } from '@/components/ai/Chat';
import { AuthForm } from '@/components/forms/AuthForm';
import { EmployeesManager } from '@/components/forms/EmployeeForms';
import { OnboardingForm } from '@/components/forms/OnboardingForm';
import { SaleComposer } from '@/components/forms/SaleComposer';
import { BusinessSettingsForm, ReportSettingsForm, TelegramConnect, ThemePicker } from '@/components/forms/SettingsForms';
import { Shell } from '@/components/Shell';
import { PageTitle, Section } from '@/components/ui';
import { DashboardView } from '@/components/views/DashboardView';
import { ExpensesView } from '@/components/views/ExpensesView';
import { InventoryView } from '@/components/views/InventoryView';
import { ProductionView } from '@/components/views/ProductionView';
import { ReportsView } from '@/components/views/ReportsView';
import { SalesView } from '@/components/views/SalesView';
import { coordinate } from '@/lib/ai/coordinator';
import { ALLOWED_RPC, type AgentContext } from '@/lib/ai/types';
import { addDays, periodFor, previousPeriod } from '@/lib/dates';
import { dict } from '@/lib/i18n';
import { MORE_ITEMS, PRIMARY_ITEMS, visible } from '@/lib/nav';
import type { Business, Lang, Permissions, Product } from '@/lib/types';

const DB = process.env.TEST_DB ?? 'bizpro_ai';
const OUT = process.argv[2] ?? './out';
const OWNER = 'a1000000-0000-0000-0000-000000000001';
const SELLER = 'a1000000-0000-0000-0000-000000000002';
const lit = (v: unknown) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

function q<T>(user: string | null, sqlText: string): T {
  const pre = user ? `select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: user, role: 'authenticated' }))}, false) \\g /dev/null\nset role authenticated;\n` : '';
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB], { encoding: 'utf8', input: pre + sqlText + '\n' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim() || 'null') as T;
}
const fn = <T,>(user: string, name: string, args: Record<string, unknown>) => {
  const call = `public.${name}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
  return name === 'list_products'
    ? q<T>(user, `select coalesce(jsonb_agg(to_jsonb(x)), '[]')::text from ${call} x;`)
    : q<T>(user, `select to_jsonb(${call})::text;`);
};

const BIZ = q<string>(null, `select to_jsonb(id)::text from businesses where name = 'Test Somsa'`);
const business = q<Business>(null, `select to_jsonb(b)::text from (select id,name,type,modules,currency,language,timezone,allow_negative_stock,report_time,report_channel,telegram_chat_id,agent_settings from businesses where id = ${lit(BIZ)}) b`);
const tz = business.timezone;
const today = periodFor('today', tz).from;
const all: Permissions = { add_expenses: true, view_finance: true, delete_records: true, manage_inventory: true, record_production: true, edit_prices: true };
const none: Permissions = { add_expenses: false, view_finance: false, delete_records: false, manage_inventory: false, record_production: false, edit_prices: false };
const css = readFileSync(join(__dirname, '../../src/app/globals.css'), 'utf8');

function page(name: string, body: string, lang: Lang, theme = 'dark') {
  const html = `<!doctype html><html lang="${lang}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${name}</title><style>${css}</style></head><body>${body}</body></html>`;
  writeFileSync(join(OUT, `${name}.html`), html);
}

function shell(path: string, lang: Lang, isOwner: boolean, perms: Permissions, children: any) {
  (globalThis as { __path?: string }).__path = path;
  const t = dict(lang);
  return renderToStaticMarkup(
    <Shell t={t} businessName={business.name} roleLabel={isOwner ? t.emp.owner : t.emp.employee}
      primary={visible(PRIMARY_ITEMS, business.modules, perms, isOwner)} secondary={visible(MORE_ITEMS, business.modules, perms, isOwner)}>
      {children}
    </Shell>,
  );
}

async function main() {
  (globalThis as { React?: unknown }).React = ReactNS; // app files compile with the classic JSX transform here
  mkdirSync(OUT, { recursive: true });
  const lang: Lang = 'ky';
  const t = dict(lang);
  const cur = business.currency;
  const products = fn<Product[]>(OWNER, 'list_products', { p_business: BIZ, p_include_inactive: true }).map((p) => ({ ...p, sale_price: Number(p.sale_price), stock: Number(p.stock), min_stock: Number(p.min_stock), cost_price: p.cost_price === null ? null : Number(p.cost_price) }));
  const range = (u: string, from: string, to: string) => ({ p_business: BIZ, p_from: from, p_to: to, ...(u ? {} : {}) });

  // ---------------------------------------------------------------- auth
  page('01-login', renderToStaticMarkup(<AuthForm mode="login" t={t} lang={lang} />), lang);
  page('02-onboarding', renderToStaticMarkup(<OnboardingForm t={dict('ru')} lang="ru" ownerName="" />), 'ru');

  // ---------------------------------------------------------------- dashboard (owner + employee)
  const yest = previousPeriod(periodFor('today', tz));
  const dash = (user: string, perms: Permissions) => (
    <DashboardView t={t} lang={lang} currency={cur} name={user === OWNER ? 'Азамат' : 'Seller One'}
      overview={fn(user, 'fn_sales_overview', range(user, today, today))}
      prevRevenue={Number(fn<{ revenue: number }>(user, 'fn_sales_overview', range(user, yest.from, yest.to)).revenue)}
      finance={perms.view_finance ? fn(user, 'fn_finance_summary', range(user, today, today)) : null}
      series={fn(user, 'fn_sales_series', range(user, addDays(today, -6), today))}
      top={fn(user, 'fn_top_products', { ...range(user, addDays(today, -6), today), p_limit: 5 })}
      inventory={fn(user, 'fn_inventory_status', { p_business: BIZ })} modules={business.modules} perms={perms} />
  );
  page('03-dashboard-owner', shell('/dashboard', lang, true, all, dash(OWNER, all)), lang);
  page('04-dashboard-employee', shell('/dashboard', lang, false, none, dash(SELLER, none)), lang);
  page('05-dashboard-owner-light', shell('/dashboard', lang, true, all, dash(OWNER, all)), lang, 'light');

  // ---------------------------------------------------------------- POS
  const serials: Record<string, string[]> = {};
  page('06-pos', shell('/sales', lang, true, all, <SaleComposer t={t} lang={lang} currency={cur} products={products} serials={serials} canEditPrice allowNegative={false} />), lang);

  // ---------------------------------------------------------------- sales list
  const week = periodFor('last_7_days', tz);
  const salesRows = q<any[]>(OWNER, `select coalesce(jsonb_agg(x order by x->>'soldAt' desc), '[]')::text from (select jsonb_build_object('id', s.id, 'total', s.total, 'payment', s.payment_method, 'soldAt', s.sold_at, 'voided', s.voided, 'voidReason', s.void_reason,
      'seller', (select full_name from memberships m where m.user_id = s.created_by and m.business_id = s.business_id),
      'items', (select string_agg(p.name || ' ×' || trim(to_char(i.quantity, 'FM999990.###')), ', ') from sale_items i join products p on p.id = i.product_id where i.sale_id = s.id)) x
      from sales s where s.business_id = ${lit(BIZ)} and s.sold_at > now() - interval '7 days') z`);
  page('07-sales', shell('/sales', lang, true, all, <SalesView t={t} lang={lang} currency={cur} timezone={tz} periodKey="last_7_days"
    overview={fn(OWNER, 'fn_sales_overview', range(OWNER, week.from, week.to))} rows={salesRows.map((r) => ({ ...r, total: Number(r.total) }))} canVoid />), lang);

  // ---------------------------------------------------------------- expenses with sheet open
  const month = periodFor('this_month', tz);
  const expRows = q<any[]>(OWNER, `select coalesce(jsonb_agg(jsonb_build_object('id', id, 'category', category, 'amount', amount, 'note', note, 'spent_on', spent_on, 'by', 'Азамат')), '[]')::text from expenses where business_id = ${lit(BIZ)}`);
  page('08-expenses-sheet', shell('/expenses', lang, true, all, <ExpensesView t={t} lang={lang} currency={cur} periodKey="this_month" today={today}
    breakdown={fn(OWNER, 'fn_expense_breakdown', range(OWNER, month.from, month.to))} rows={expRows.map((e) => ({ ...e, amount: Number(e.amount) }))} canAdd canDelete openNew />), lang);

  // ---------------------------------------------------------------- inventory
  page('09-inventory', shell('/inventory', lang, true, all, <InventoryView t={t} lang={lang} currency={cur} products={products}
    status={fn(OWNER, 'fn_inventory_status', { p_business: BIZ })} lowOnly={false} canManage showCost serialsEnabled={false} productionEnabled purchasesEnabled openNew={false} />), lang);

  // ---------------------------------------------------------------- production with sheet
  const recipes = q<any[]>(OWNER, `select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'product_id', r.product_id, 'yield_qty', r.yield_qty, 'notes', r.notes,
     'items', (select jsonb_agg(jsonb_build_object('ingredient_id', i.ingredient_id, 'quantity', i.quantity)) from recipe_items i where i.recipe_id = r.id))), '[]')::text from recipes r where r.business_id = ${lit(BIZ)}`);
  const batches = q<any[]>(OWNER, `select coalesce(jsonb_agg(jsonb_build_object('id', id, 'product_id', product_id, 'quantity', quantity, 'produced_at', produced_at)), '[]')::text from production_batches where business_id = ${lit(BIZ)}`);
  page('10-production-sheet', shell('/production', lang, true, all, <ProductionView t={t} lang={lang} currency={cur} timezone={tz} products={products}
    recipes={recipes.map((r) => ({ ...r, yield_qty: Number(r.yield_qty), items: r.items.map((i: any) => ({ ...i, quantity: Number(i.quantity) })) }))}
    summary={fn(OWNER, 'fn_production_summary', range(OWNER, week.from, week.to))} batches={batches.map((b) => ({ ...b, quantity: Number(b.quantity) }))} canRecord openNew />), lang);

  // ---------------------------------------------------------------- reports (ru, owner) and restricted (employee)
  const rt = dict('ru');
  const prevW = previousPeriod(week);
  const rep = (user: string, perms: Permissions, l: Lang) => (
    <ReportsView t={dict(l)} lang={l} currency={cur} periodKey="last_7_days" today={today}
      finance={perms.view_finance ? fn(user, 'fn_finance_summary', range(user, week.from, week.to)) : null}
      prevFinance={perms.view_finance ? fn(user, 'fn_finance_summary', range(user, prevW.from, prevW.to)) : null}
      overview={fn(user, 'fn_sales_overview', range(user, week.from, week.to))} series={fn(user, 'fn_sales_series', range(user, week.from, week.to))}
      top={fn(user, 'fn_top_products', { ...range(user, week.from, week.to), p_limit: 10 })} employees={fn(user, 'fn_employee_sales', range(user, week.from, week.to))}
      expenses={fn(user, 'fn_expense_breakdown', range(user, week.from, week.to))} quality={fn(user, 'fn_data_quality', range(user, week.from, week.to))} canSendTelegram={false} />
  );
  page('11-reports-owner-ru', shell('/reports', 'ru', true, all, rep(OWNER, all, 'ru')), 'ru');
  page('12-reports-employee', shell('/reports', lang, false, none, rep(SELLER, none, lang)), lang);
  void rt;

  // ---------------------------------------------------------------- AI chat with real coordinator answers (rules mode)
  const port = { async call<T>(name: (typeof ALLOWED_RPC)[number], args: Record<string, unknown>) { return fn<T>(OWNER, name, args); } };
  const actx = (): AgentContext => ({ businessId: BIZ, businessName: business.name, businessType: business.type, modules: business.modules, currency: cur, lang,
    timezone: tz, role: 'owner', perms: all, disabledAgents: [], data: port, t });
  const msgs: ChatMessage[] = [];
  for (const question of ['Бүгүнкү таза пайдам канча?', 'Кампада эмне аз калды?']) {
    const r = await coordinate(actx(), question);
    msgs.push({ id: 'u' + msgs.length, role: 'user', content: question });
    msgs.push({ id: 'a' + msgs.length, role: 'assistant', content: r.answer, mode: r.mode, reports: r.reports.map((x) => ({ agent: x.agent, status: x.status, intent: x.task.intent, facts: x.facts })) });
  }
  const team = (['sales', 'finance', 'inventory', 'employee', 'production', 'analyst'] as const).map((id) => ({ id, on: true }));
  page('13-ai-chat', shell('/ai', lang, true, all, <Chat t={t} conversationId="x" initial={msgs} team={team} llm={false} />), lang);
  page('14-ai-empty', shell('/ai', lang, true, all, <Chat t={t} conversationId={null} initial={[]} team={team} llm={false} />), lang);

  // ---------------------------------------------------------------- employees + settings
  const members = q<any[]>(OWNER, `select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('revenue', 0, 'salesCount', 0)), '[]')::text from memberships m where business_id = ${lit(BIZ)}`);
  page('15-employees', shell('/employees', lang, true, all, <div className="stack"><PageTitle>{t.emp.title}</PageTitle><EmployeesManager t={t} lang={lang} currency={cur} members={members} serviceReady={false} /></div>), lang);
  page('16-settings', shell('/settings', lang, true, all, (
    <div className="stack"><PageTitle>{t.settings.title}</PageTitle>
      <Section title={t.settings.appearance}><div className="card row between wrap"><span className="bold small">{t.settings.theme}</span><ThemePicker t={t} theme="dark" /></div></Section>
      <Section title={t.settings.business}><BusinessSettingsForm t={t} business={business} /></Section>
      <Section title={t.settings.reports}><ReportSettingsForm t={t} business={business} /></Section>
      <Section title={t.settings.telegram}><TelegramConnect t={t} connected={false} configured botName="bizpro_bot" /></Section>
    </div>
  )), lang);

  // Uzbek dashboard for language coverage
  const tu = dict('uz');
  page('17-dashboard-uz', shell('/dashboard', 'uz', true, all, <DashboardView t={tu} lang="uz" currency={cur} name="Azamat"
    overview={fn(OWNER, 'fn_sales_overview', range(OWNER, today, today))} prevRevenue={0} finance={fn(OWNER, 'fn_finance_summary', range(OWNER, today, today))}
    series={fn(OWNER, 'fn_sales_series', range(OWNER, addDays(today, -6), today))} top={fn(OWNER, 'fn_top_products', { ...range(OWNER, addDays(today, -6), today), p_limit: 5 })}
    inventory={fn(OWNER, 'fn_inventory_status', { p_business: BIZ })} modules={business.modules} perms={all} />), 'uz');
  console.log('rendered to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
