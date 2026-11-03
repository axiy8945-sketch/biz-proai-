import { daysBetween, type Period } from '../../dates';
import { money, num, shortDate } from '../../format';
import { fmt } from '../../i18n';
import type { AgentContext, AgentId, AgentReport, AgentTask, ReportStatus } from '../types';
import { DataError } from '../types';

export const m = (ctx: AgentContext, v: number | null | undefined) => money(v === null || v === undefined ? null : Number(v), ctx.currency, ctx.lang);

export function periodLabel(ctx: AgentContext, p: Period): string {
  if (p.key !== 'custom') return ctx.t.period[p.key];
  return p.from === p.to ? shortDate(p.from, ctx.lang) : `${shortDate(p.from, ctx.lang)} – ${shortDate(p.to, ctx.lang)}`;
}

export function periodDays(p: Period): number { return daysBetween(p.from, p.to) + 1; }

/** Percentage change rounded to one decimal; null when the base is zero. */
export function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function report(agent: AgentId, task: AgentTask, status: ReportStatus = 'ok'): AgentReport {
  return { agent, task, status, data: {}, facts: [], text: [], warnings: [] };
}

export function deniedReport(ctx: AgentContext, agent: AgentId, task: AgentTask): AgentReport {
  const r = report(agent, task, 'denied');
  r.text.push(fmt(ctx.t.tpl.denied, { agent: ctx.t.agent[agent] }));
  return r;
}

export function isPermissionError(e: unknown): boolean {
  return e instanceof DataError && ['forbidden', 'finance_forbidden', 'owner_only'].includes(e.code);
}

export { fmt, num };
