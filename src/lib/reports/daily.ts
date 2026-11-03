// Builds the daily report from deterministic SQL figures + the Business Analyst's insights.
import { analystAgent } from '../ai/agents/analyst';
import type { DataPort } from '../ai/types';
import type { Period } from '../dates';
import { money, num, shortDate } from '../format';
import { dict, fmt } from '../i18n';
import type { BusinessType, EmployeeSales, FinanceSummary, InventoryStatus, Lang, ModuleId, ProductionSummary, TopProduct } from '../types';

export interface DailyReportData {
  business: { id: string; name: string; type: BusinessType; currency: string; language: Lang };
  date: string;
  finance: FinanceSummary; previous_day: FinanceSummary; same_day_last_week: FinanceSummary;
  top_products: TopProduct[]; employees: EmployeeSales[]; inventory: InventoryStatus; production: ProductionSummary | null;
}

export async function buildDailyReport(data: DailyReportData, port: DataPort, modules: ModuleId[], timezone: string, lang: Lang): Promise<string> {
  const t = dict(lang);
  const c = data.business.currency;
  const m = (v: number | null) => money(v === null ? null : Number(v), c, lang);
  const f = data.finance;
  const lines: string[] = [
    t.report.title, '',
    `${t.report.business}: ${data.business.name}`,
    `${t.report.date}: ${shortDate(data.date, lang)} ${data.date.slice(0, 4)}`, '',
    `${t.report.totalSales}: ${m(f.revenue)} (${f.sales_count})`,
    `${t.report.totalExpenses}: ${m(f.expenses)}`,
    `${t.report.cogs}: ${m(f.cogs)}`,
    `${t.report.net}: ${m(f.net_profit)}`, '',
    `${t.report.top}:`,
    ...(data.top_products.length ? data.top_products.map((p, i) => `${i + 1}. ${p.name} — ${num(p.quantity)} ${t.unit[p.unit as keyof typeof t.unit] ?? p.unit}, ${m(p.revenue)}`) : [`— ${t.report.none}`]), '',
    `${t.report.employees}:`,
    ...(data.employees.filter((e) => e.sales_count > 0).length
      ? data.employees.filter((e) => e.sales_count > 0).map((e) => `• ${e.full_name}: ${m(e.revenue)} (${e.sales_count})`) : [`— ${t.report.none}`]), '',
    `${t.report.inventory}:`,
    ...(data.inventory.low_stock.length
      ? data.inventory.low_stock.slice(0, 10).map((x) => `• ${x.name}: ${num(x.stock)} ${t.unit[x.unit]} (min ${num(x.min_stock)})`) : [`— ${t.tpl.noLow}`]),
  ];
  if (data.production && data.production.batches) {
    lines.push('', `${t.report.production}:`, ...data.production.by_product.map((p) => `• ${p.name}: ${num(p.quantity)}`));
  }
  const period: Period = { key: 'custom', from: data.date, to: data.date };
  const analysis = await analystAgent.run({
    businessId: data.business.id, businessName: data.business.name, businessType: data.business.type, modules, currency: c, lang, timezone,
    role: 'owner', perms: { add_expenses: true, view_finance: true, delete_records: true, manage_inventory: true, record_production: true, edit_prices: true },
    disabledAgents: [], data: port, t,
  }, { agent: 'analyst', intent: 'performance', period });
  lines.push('', `${t.report.analysis}:`);
  const changeVsWeek = data.same_day_last_week.revenue > 0 ? Math.round(((f.revenue - data.same_day_last_week.revenue) / data.same_day_last_week.revenue) * 1000) / 10 : null;
  if (changeVsWeek !== null) lines.push(`• ${fmt(changeVsWeek >= 0 ? t.insight.revenue_up : t.insight.revenue_down, { pct: num(Math.abs(changeVsWeek), 1) })} (${shortDate(data.same_day_last_week.from, lang)})`);
  for (const s of analysis.insights ?? []) lines.push(`• ${s}`);
  for (const s of analysis.recommendations ?? []) lines.push(`→ ${s}`);
  for (const w of new Set([...analysis.warnings])) lines.push(`⚠ ${w}`);
  if (!f.sales_count) lines.push(`⚠ ${t.warn.no_sales}`);
  return lines.join('\n');
}
