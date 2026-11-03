// CENTRAL AI COORDINATOR
// 1. PLAN    — understand the question and pick agents + periods (LLM tool call, validated; router fallback)
// 2. EXECUTE — run agents in parallel against whitelisted DB functions under the user's own session (RLS)
// 3. ANALYSE — the Business Analyst runs last and sees the other agents' reports
// 4. COMPOSE — LLM writes the answer from the reports only; a number guard rejects any figure
//              that is not in the reports and falls back to the deterministic answer.
import { isIsoDate, periodFor, type Period, type PeriodKey } from '../dates';
import { dict, fmt, isLang } from '../i18n';
import type { Lang } from '../types';
import { analystAgent } from './agents/analyst';
import { employeeAgent } from './agents/employee';
import { financeAgent } from './agents/finance';
import { inventoryAgent } from './agents/inventory';
import { productionAgent } from './agents/production';
import { salesAgent } from './agents/sales';
import { report } from './agents/util';
import { allowedNumbers, findUnsupportedNumbers } from './guard';
import type { LlmClient, LlmMessage } from './llm-types';
import { routeQuestion } from './router';
import { AGENT_IDS, INTENTS, type Agent, type AgentContext, type AgentId, type AgentReport, type AgentTask, type CoordinatorResult } from './types';

export const AGENTS: Record<AgentId, Agent> = {
  sales: salesAgent, finance: financeAgent, inventory: inventoryAgent,
  employee: employeeAgent, production: productionAgent, analyst: analystAgent,
};

const PERIOD_KEYS: PeriodKey[] = ['today', 'yesterday', 'this_week', 'last_7_days', 'this_month', 'last_month', 'last_30_days', 'custom'];
const MAX_TASKS = 6;

export function agentAvailable(ctx: AgentContext, id: AgentId): boolean {
  const a = AGENTS[id];
  if (ctx.disabledAgents.includes(id)) return false;
  if (a.module && !ctx.modules.includes(a.module)) return false;
  return true;
}

/** Detects the answer language: Kyrgyz-specific letters, Uzbek Latin markers, else Russian, else business default. */
export function detectLang(text: string, fallback: Lang): Lang {
  if (/[өүң]/i.test(text)) return 'ky';
  if (/[ўқғҳ]/i.test(text)) return 'uz';
  if (/[a-z]/i.test(text) && /(o'|g'|sh|ch|qanday|qancha|bugun|savdo|foyda|tovar|xodim|ombor|nima|kim)/i.test(text)) return 'uz';
  if (/[а-яё]/i.test(text)) {
    if (/(канча|кайсы|бүгүн|бугун|кампа|кызматкер|пайда|киреше|эмне|кандай|сатып)/i.test(text)) return 'ky';
    return 'ru';
  }
  return fallback;
}

// ---------------------------------------------------------------- planning
const PLAN_TOOL = {
  name: 'plan',
  description: 'Choose which specialist agents must answer the owner question, with the period for each.',
  input_schema: {
    type: 'object',
    properties: {
      language: { type: 'string', enum: ['ky', 'uz', 'ru'], description: 'Language of the question / answer' },
      tasks: {
        type: 'array', maxItems: MAX_TASKS,
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', enum: AGENT_IDS },
            intent: { type: 'string', description: 'One of the intents listed for the agent' },
            period: { type: 'string', enum: PERIOD_KEYS },
            from: { type: 'string', description: 'YYYY-MM-DD, only for period=custom' },
            to: { type: 'string', description: 'YYYY-MM-DD, only for period=custom' },
            product: { type: 'string', description: 'Product name, only for inventory.product_stock' },
          },
          required: ['agent', 'intent', 'period'],
        },
      },
    },
    required: ['language', 'tasks'],
  },
};

function planSystem(ctx: AgentContext, today: string): string {
  const intents = AGENT_IDS.filter((a) => agentAvailable(ctx, a)).map((a) => `- ${a}: ${INTENTS[a].join(', ')}`).join('\n');
  return [
    'You are the BizPro AI Coordinator. Route the business owner\'s question to specialist agents.',
    `Today is ${today} (business timezone ${ctx.timezone}). Business type: ${ctx.businessType}.`,
    'Available agents and intents:', intents,
    'Rules: pick the minimum set of agents that fully answers the question. For "how is my business doing" style questions',
    'use finance.summary (or sales.revenue), sales.top_products, inventory.low_stock and analyst.performance.',
    'Default periods: revenue/profit → today; top products/employees → this_month; trends → last_7_days.',
    'If the question is not about this business\'s data, return an empty task list.',
  ].join('\n');
}

export function validatePlan(raw: unknown, ctx: AgentContext): { tasks: AgentTask[]; lang?: Lang } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { language?: unknown; tasks?: unknown };
  if (!Array.isArray(obj.tasks)) return null;
  const tasks: AgentTask[] = [];
  for (const t of obj.tasks.slice(0, MAX_TASKS)) {
    if (!t || typeof t !== 'object') return null;
    const { agent, intent, period, from, to, product } = t as Record<string, unknown>;
    if (!AGENT_IDS.includes(agent as AgentId)) return null;
    if (!(INTENTS[agent as AgentId] as readonly string[]).includes(intent as string)) return null;
    if (!PERIOD_KEYS.includes(period as PeriodKey)) return null;
    let p: Period;
    if (period === 'custom') {
      if (!isIsoDate(from) || !isIsoDate(to) || from > to) return null;
      p = { key: 'custom', from, to };
    } else p = periodFor(period as PeriodKey, ctx.timezone, ctx.now);
    tasks.push({ agent: agent as AgentId, intent: intent as string, period: p, ...(typeof product === 'string' && product.trim() ? { product: product.trim().slice(0, 60) } : {}) });
  }
  return { tasks, lang: isLang(obj.language) ? obj.language : undefined };
}

// ---------------------------------------------------------------- execution
export async function executePlan(ctx: AgentContext, tasks: AgentTask[]): Promise<AgentReport[]> {
  const ordered = [...tasks.filter((t) => t.agent !== 'analyst'), ...tasks.filter((t) => t.agent === 'analyst')];
  const runOne = async (task: AgentTask, peers: AgentReport[]): Promise<AgentReport> => {
    if (!agentAvailable(ctx, task.agent)) {
      const r = report(task.agent, task, 'disabled');
      const mod = AGENTS[task.agent].module;
      r.text.push(mod && !ctx.modules.includes(mod) ? fmt(ctx.t.tpl.moduleOff, { module: ctx.t.modules[mod] }) : `${ctx.t.agent[task.agent]}: ${ctx.t.ai.agentOff}.`);
      return r;
    }
    try {
      return await AGENTS[task.agent].run(ctx, task, peers);
    } catch (e) {
      const r = report(task.agent, task, 'error');
      r.text.push(`${ctx.t.agent[task.agent]}: ${ctx.t.errors.generic}`);
      r.data.error = e instanceof Error ? e.message.slice(0, 120) : 'error';
      return r;
    }
  };
  const specialists = await Promise.all(ordered.filter((t) => t.agent !== 'analyst').map((t) => runOne(t, [])));
  const analysts = await Promise.all(ordered.filter((t) => t.agent === 'analyst').map((t) => runOne(t, specialists)));
  return [...specialists, ...analysts];
}

export function composeDeterministic(ctx: AgentContext, reports: AgentReport[]): string {
  if (!reports.length) return ctx.t.tpl.unknownQuestion;
  const parts = reports.map((r) => r.text.join('\n')).filter(Boolean);
  const warnings = [...new Set(reports.flatMap((r) => r.warnings))];
  if (warnings.length) parts.push(`⚠ ${ctx.t.ai.warnings}:\n` + warnings.map((w) => '• ' + w).join('\n'));
  return parts.join('\n\n');
}

function composeSystem(ctx: AgentContext): string {
  const langName = { ky: 'Kyrgyz (Cyrillic)', uz: 'Uzbek (Latin script)', ru: 'Russian' }[ctx.lang];
  return [
    `You are the BizPro AI Coordinator for "${ctx.businessName}". Write the final answer in ${langName}.`,
    'You receive JSON reports from specialist agents. Each report has exact database figures ("data"), pre-formatted',
    'sentences ("text"), and honest data gaps ("warnings").',
    'STRICT RULES:',
    '- Use ONLY numbers that appear in the reports. Copy money values exactly as written in "text" (with currency).',
    '- Never estimate, extrapolate or invent figures, products, employees or dates.',
    '- If a report status is "denied", "disabled", "empty" or "error", say so plainly — do not fill the gap.',
    '- Always mention every warning briefly at the end.',
    '- Be concise and practical: short paragraphs or bullets, readable on a phone. No markdown headings, no tables.',
    '- Recommendations may only restate the analyst\'s "recommendations".',
  ].join('\n');
}

// ---------------------------------------------------------------- entry point
export async function coordinate(
  ctx: AgentContext,
  question: string,
  opts: { llm?: LlmClient | null; history?: LlmMessage[] } = {},
): Promise<CoordinatorResult> {
  const q = question.trim().slice(0, 1000);
  ctx.lang = detectLang(q, ctx.lang);

  // 1. plan
  let tasks: AgentTask[] = [];
  let usedLlmPlan = false;
  if (opts.llm) {
    try {
      const today = periodFor('today', ctx.timezone, ctx.now).from;
      const res = await opts.llm.complete({
        system: planSystem(ctx, today),
        messages: [...(opts.history ?? []).slice(-4), { role: 'user', content: q }],
        tools: [PLAN_TOOL], forceTool: 'plan', maxTokens: 600,
      });
      const plan = validatePlan(res.toolInput, ctx);
      if (plan) { tasks = plan.tasks; usedLlmPlan = true; if (plan.lang) ctx.lang = plan.lang; }
    } catch { /* fall back to router */ }
  }
  if (!usedLlmPlan) tasks = routeQuestion(q, ctx.timezone, ctx.now);
  // the analyst always needs fresh facts for its own period; finance tasks for employees become sales tasks
  tasks = tasks.map((t) => (t.agent === 'finance' && !ctx.perms.view_finance && t.intent !== 'expenses' ? { ...t, agent: 'sales', intent: 'revenue' } : t));
  tasks = tasks.filter((t, i, arr) => arr.findIndex((x) => x.agent === t.agent && x.intent === t.intent && x.period.from === t.period.from && x.period.to === t.period.to) === i);

  // Answer in the question's language
  ctx.t = dict(ctx.lang);

  if (!tasks.length) {
    return { answer: ctx.t.tpl.unknownQuestion, lang: ctx.lang, mode: 'rules', plan: [], reports: [], warnings: [] };
  }

  // 2+3. execute
  const reports = await executePlan(ctx, tasks);
  const warnings = [...new Set(reports.flatMap((r) => r.warnings))];
  const deterministic = composeDeterministic(ctx, reports);

  // 4. compose
  if (opts.llm) {
    try {
      const payload = reports.map((r) => ({
        agent: r.agent, intent: r.task.intent, period: r.task.period, status: r.status,
        data: r.data, text: r.text, warnings: r.warnings, insights: r.insights, recommendations: r.recommendations,
      }));
      const res = await opts.llm.complete({
        system: composeSystem(ctx),
        messages: [{ role: 'user', content: `Question: ${q}\n\nAgent reports (JSON):\n${JSON.stringify(payload)}` }],
        maxTokens: 900,
      });
      const answer = res.text.trim();
      const bad = findUnsupportedNumbers(answer, allowedNumbers(reports, q));
      if (answer && bad.length === 0) return { answer, lang: ctx.lang, mode: 'llm', plan: tasks, reports, warnings };
    } catch { /* fall through */ }
  }
  return { answer: deterministic, lang: ctx.lang, mode: 'rules', plan: tasks, reports, warnings };
}
