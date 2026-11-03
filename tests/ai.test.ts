// AI team integration tests: real agents + coordinator against the real SQL
// functions in a local Postgres, executed as the logged-in user (RLS active).
// Run: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tsx tests/ai.test.ts
import { spawnSync } from 'node:child_process';
import { coordinate, executePlan, validatePlan } from '../src/lib/ai/coordinator';
import { findUnsupportedNumbers, allowedNumbers } from '../src/lib/ai/guard';
import type { LlmClient } from '../src/lib/ai/llm-types';
import { routeQuestion } from '../src/lib/ai/router';
import { ALLOWED_RPC, DataError, type AgentContext, type AllowedRpc, type DataPort } from '../src/lib/ai/types';
import { periodFor } from '../src/lib/dates';
import { dict } from '../src/lib/i18n';
import type { Permissions } from '../src/lib/types';

const DB = process.env.TEST_DB ?? 'bizpro_ai';
const OWNER = 'a1000000-0000-0000-0000-000000000001';
const SELLER = 'a1000000-0000-0000-0000-000000000002';
const STRANGER = 'a1000000-0000-0000-0000-000000000003';

function sql(q: string): string {
  const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', q], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}
const lit = (v: string | number | null) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

function psqlPort(userId: string): DataPort {
  return {
    async call<T>(fn: AllowedRpc, args: Record<string, string | number | null>): Promise<T> {
      if (!ALLOWED_RPC.includes(fn)) throw new DataError('rpc_not_allowed');
      const named = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
      const out = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB], {
        encoding: 'utf8',
        input: `select set_config('request.jwt.claims', ${lit(claims)}, false) \\g /dev/null\nset role authenticated;\nselect to_jsonb(public.${fn}(${named}))::text;\n`,
      });
      if (out.status !== 0) {
        const msg = out.stderr.replace(/^.*ERROR:\s*/s, '').split('\n')[0];
        throw new DataError(msg.split(':')[0].trim(), msg);
      }
      return JSON.parse(out.stdout.trim()) as T;
    },
  };
}

const allPerms: Permissions = { add_expenses: true, view_finance: true, delete_records: true, manage_inventory: true, record_production: true, edit_prices: true };
const noPerms: Permissions = { add_expenses: false, view_finance: false, delete_records: false, manage_inventory: false, record_production: false, edit_prices: false };
const BIZ = sql(`select id from businesses where name = 'Test Somsa'`);

function ctx(user: string, opts: Partial<AgentContext> = {}): AgentContext {
  return {
    businessId: BIZ, businessName: 'Test Somsa', businessType: 'somsa',
    modules: ['sales', 'expenses', 'inventory', 'purchases', 'production', 'recipes', 'employees', 'reports', 'stock_alerts'],
    currency: 'KGS', lang: 'ky', timezone: 'Asia/Bishkek', role: user === OWNER ? 'owner' : 'employee',
    perms: user === OWNER ? allPerms : noPerms, disabledAgents: [], data: psqlPort(user), t: dict('ky'), ...opts,
  };
}

let passed = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  passed++; console.log('ok ', msg);
}

async function main() {
  // ---------------- router (the 7 example questions from the spec)
  const tz = 'Asia/Bishkek';
  const plan = (q: string) => routeQuestion(q, tz).map((t) => `${t.agent}.${t.intent}@${t.period.key}`);
  ok(plan('Бүгүн канча киреше түштү?').join() === 'sales.revenue@today', 'ky: revenue today');
  ok(plan('Бүгүнкү таза пайдам канча?').join() === 'finance.profit@today', 'ky: net profit today');
  ok(plan('Кайсы товар көп сатылды?').join() === 'sales.top_products@this_month', 'ky: top products');
  ok(plan('Кайсы кызматкер көп сатты?').join() === 'employee.sales_by_employee@this_month', 'ky: best employee');
  ok(plan('Кампада эмне аз калды?').join() === 'inventory.low_stock@today', 'ky: low stock');
  ok(plan('Кайсы товарды кайра сатып алышым керек?').join() === 'inventory.restock@today', 'ky: restock');
  ok(plan('Бул айда бизнесим кандай иштеди?').join() === 'finance.summary@this_month,sales.revenue@this_month,sales.top_products@this_month,inventory.low_stock@this_month,analyst.performance@this_month', 'ky: monthly performance → 4 agents + analyst');
  ok(plan('Сколько выручки вчера?').join() === 'sales.revenue@yesterday', 'ru: revenue yesterday');
  ok(plan('Bugun qancha foyda qildim?').join() === 'finance.profit@today', 'uz: profit today');
  ok(plan('Omborda nima kam qoldi?').join() === 'inventory.low_stock@today', 'uz: low stock');
  ok(plan('Сколько сырья ушло на производство на этой неделе?')[0] === 'production.summary@this_week', 'ru: production this week');
  ok(plan('Расскажи анекдот').length === 0, 'off-topic → no agents');

  // ---------------- agents against real data (owner)
  const today = periodFor('today', tz);
  const [fin] = await executePlan(ctx(OWNER), [{ agent: 'finance', intent: 'profit', period: today }]);
  const s = fin.data.summary as { revenue: number; cogs: number; expenses: number; net_profit: number };
  ok(Number(s.revenue) === 1090, 'finance: today revenue 950 (owner) + 140 (seller) = 1090');
  ok(Number(s.cogs) === 475, 'finance: COGS 10×36 + 5×5 + 2×45 = 475');
  ok(Number(s.net_profit) === -2385, 'finance: net = 1090 − 475 − 3000 = −2385');
  ok(fin.text[0].includes('1 090'), 'finance text uses DB figure');

  const [inv] = await executePlan(ctx(OWNER), [{ agent: 'inventory', intent: 'low_stock', period: today }]);
  const low = (inv.data.inventory as { low_stock: { name: string }[] }).low_stock.map((x) => x.name);
  ok(low.includes('Meat') && low.includes('Cola') && low.includes('Somsa'), 'inventory: Meat, Cola, Somsa flagged');
  ok(!low.includes('Tea'), 'inventory: Tea not flagged');

  const [prod] = await executePlan(ctx(OWNER), [{ agent: 'production', intent: 'summary', period: periodFor('this_month', tz) }]);
  ok((prod.data.production as { batches: number }).batches === 1, 'production: one batch');

  const [emp] = await executePlan(ctx(OWNER), [{ agent: 'employee', intent: 'sales_by_employee', period: today }]);
  ok((emp.data.employees as unknown[]).length === 2, 'employee: owner sees both people');

  // ---------------- permissions: seller (employee without finance)
  const sellerReports = await executePlan(ctx(SELLER), [
    { agent: 'finance', intent: 'profit', period: today },
    { agent: 'sales', intent: 'revenue', period: today },
    { agent: 'employee', intent: 'sales_by_employee', period: today },
    { agent: 'employee', intent: 'activity', period: today },
  ]);
  ok(sellerReports[0].status === 'denied', 'seller: finance agent denied');
  ok(Number((sellerReports[1].data.overview as { revenue: number }).revenue) === 140, 'seller: sales agent sees only own 140');
  ok((sellerReports[2].data.employees as unknown[]).length === 1, 'seller: employee agent shows only self');
  ok(sellerReports[3].status === 'denied', 'seller: activity log denied');

  // stranger cannot read another business even with forged permissions
  const strangerCtx = ctx(STRANGER, { perms: allPerms, role: 'owner' });
  const [stolen] = await executePlan(strangerCtx, [{ agent: 'finance', intent: 'profit', period: today }]);
  ok(stolen.status === 'denied' || stolen.status === 'error', 'stranger with forged perms: DB still refuses');
  ok(!('summary' in stolen.data), 'stranger: no figures leaked');

  // ---------------- coordinator, deterministic mode
  const r1 = await coordinate(ctx(OWNER), 'Бүгүнкү таза пайдам канча?');
  ok(r1.mode === 'rules' && r1.lang === 'ky' && r1.answer.includes('Таза пайда'), 'coordinator answers in Kyrgyz');
  const r2 = await coordinate(ctx(OWNER), 'Как работал бизнес в этом месяце?');
  ok(r2.lang === 'ru' && r2.reports.some((x) => x.agent === 'analyst') && r2.answer.includes('Анализ'), 'coordinator: Russian monthly analysis with analyst');
  const r3 = await coordinate(ctx(SELLER), 'Бүгүнкү таза пайдам канча?');
  ok(r3.reports.every((x) => x.agent !== 'finance') && r3.answer.includes('140'), 'employee profit question re-routed to own sales');
  const r4 = await coordinate(ctx(OWNER), 'Bugun qancha tushum boʻldi?');
  ok(r4.lang === 'uz' && r4.answer.includes('Tushum'), 'coordinator answers in Uzbek');
  const r5 = await coordinate(ctx(OWNER, { modules: ['sales', 'inventory'] }), 'Сколько произвели сегодня?');
  ok(r5.reports[0].status === 'disabled', 'production agent disabled when module is off');

  // ---------------- coordinator with an LLM (mocked) — guard against invented numbers
  const mkLlm = (answer: string, planInput?: unknown): LlmClient => ({
    async complete(o) { return o.forceTool ? { text: '', toolInput: planInput } : { text: answer }; },
  });
  const goodPlan = { language: 'ru', tasks: [{ agent: 'finance', intent: 'profit', period: 'today' }] };
  const r6 = await coordinate(ctx(OWNER), 'прибыль сегодня?', { llm: mkLlm('Сегодня выручка 1 090 сом, чистая прибыль −2 385 сом.', goodPlan) });
  ok(r6.mode === 'llm', 'LLM answer with real numbers accepted');
  const r7 = await coordinate(ctx(OWNER), 'прибыль сегодня?', { llm: mkLlm('Чистая прибыль около 5 000 сом.', goodPlan) });
  ok(r7.mode === 'rules' && !r7.answer.includes('5 000'), 'LLM answer with invented number rejected → deterministic');
  const r8 = await coordinate(ctx(OWNER), 'Бүгүн канча киреше түштү?', { llm: mkLlm('x', { tasks: [{ agent: 'hacker', intent: 'drop_tables', period: 'today' }] }) });
  ok(r8.plan[0]?.agent === 'sales', 'invalid LLM plan rejected → router fallback');
  ok(validatePlan({ tasks: [{ agent: 'sales', intent: 'revenue', period: 'custom', from: '2026-01-01', to: '2025-01-01' }] }, ctx(OWNER)) === null, 'plan validator rejects inverted dates');

  // guard unit checks
  const allowed = allowedNumbers(r6.reports, 'q');
  ok(findUnsupportedNumbers('Выручка 1 090 сом', allowed).length === 0, 'guard accepts grouped number');
  ok(findUnsupportedNumbers('Выручка 1 091 сом', allowed).length === 1, 'guard flags unknown number');

  // whitelist
  let blocked = false;
  try { await psqlPort(OWNER).call('pg_sleep' as AllowedRpc, {}); } catch (e) { blocked = e instanceof DataError && e.code === 'rpc_not_allowed'; }
  ok(blocked, 'non-whitelisted function blocked');

  console.log(`\nALL AI TESTS PASSED (${passed})`);
  console.log('\n--- sample answer (ky) ---\n' + r1.answer + '\n\n--- sample analysis (ru) ---\n' + r2.answer);
}

main().catch((e) => { console.error(e); process.exit(1); });
