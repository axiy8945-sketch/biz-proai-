// FINANCE AGENT — revenue, cost of goods, expenses, gross and net profit.
// Every number comes from fn_finance_summary / fn_expense_breakdown (Postgres).
import { previousPeriod } from '../../dates';
import type { ExpenseBreakdown, FinanceSummary } from '../../types';
import type { Agent } from '../types';
import { change, deniedReport, fmt, isPermissionError, m, num, periodDays, periodLabel, report } from './util';

export const financeAgent: Agent = {
  id: 'finance',
  async run(ctx, task) {
    const r = report('finance', task);
    const pl = periodLabel(ctx, task.period);
    const args = { p_business: ctx.businessId, p_from: task.period.from, p_to: task.period.to };

    // Employees without finance permission may still see their OWN expenses.
    if (!ctx.perms.view_finance) {
      if (task.intent === 'expenses' && ctx.perms.add_expenses) {
        const eb = await ctx.data.call<ExpenseBreakdown>('fn_expense_breakdown', args);
        r.data.expenses = eb;
        r.warnings.push(ctx.t.warn.own_scope);
        r.text.push(`${ctx.t.expenses.title} ${pl}: ${m(ctx, eb.total)}.`);
        return r;
      }
      return deniedReport(ctx, 'finance', task);
    }

    let fs: FinanceSummary;
    try {
      fs = await ctx.data.call<FinanceSummary>('fn_finance_summary', args);
    } catch (e) {
      if (isPermissionError(e)) return deniedReport(ctx, 'finance', task);
      throw e;
    }
    const prevP = previousPeriod(task.period);
    const [prev, eb] = await Promise.all([
      ctx.data.call<FinanceSummary>('fn_finance_summary', { ...args, p_from: prevP.from, p_to: prevP.to }),
      ctx.data.call<ExpenseBreakdown>('fn_expense_breakdown', args),
    ]);
    r.data = { summary: fs, previous_period: { ...prevP, net_profit: prev.net_profit, revenue: prev.revenue, expenses: prev.expenses }, expenses: eb };

    if (task.intent === 'expenses') {
      r.text.push(`${ctx.t.expenses.title} ${pl}: ${m(ctx, fs.expenses)}.`);
      const topCat = eb.by_category[0];
      if (topCat) r.text.push(fmt(ctx.t.tpl.expensesTop, { cat: ctx.t.ecat[topCat.category], amount: m(ctx, topCat.amount) }));
      if (fs.expense_count === 0) r.status = 'empty';
      r.facts.push({ label: ctx.t.expenses.title, value: m(ctx, fs.expenses) });
    } else {
      r.text.push(fmt(ctx.t.tpl.profit, {
        period: pl, net: m(ctx, fs.net_profit), revenue: m(ctx, fs.revenue), cogs: m(ctx, fs.cogs), expenses: m(ctx, fs.expenses),
      }));
      if (fs.gross_margin_pct !== null) r.text.push(fmt(ctx.t.tpl.gross, { gross: m(ctx, fs.gross_profit), margin: num(fs.gross_margin_pct, 1) }));
      const ch = change(Number(fs.net_profit), Number(prev.net_profit));
      if (ch !== null && task.intent === 'summary') {
        r.data.net_change_pct = ch;
        r.text.push(fmt(ctx.t.tpl.change, { dir: ch > 0 ? ctx.t.tpl.up : ctx.t.tpl.down, pct: num(Math.abs(ch), 1), prev: m(ctx, prev.net_profit) }));
      }
      r.facts.push(
        { label: ctx.t.rep.revenue, value: m(ctx, fs.revenue) },
        { label: ctx.t.rep.cogs, value: m(ctx, fs.cogs) },
        { label: ctx.t.dash.expenses, value: m(ctx, fs.expenses) },
        { label: ctx.t.rep.net, value: m(ctx, fs.net_profit), tone: Number(fs.net_profit) >= 0 ? 'up' : 'down' },
      );
      if (fs.sales_count === 0) { r.status = 'empty'; r.warnings.push(ctx.t.warn.no_sales); }
    }

    if (fs.sales_with_unknown_cost > 0) r.warnings.push(fmt(ctx.t.warn.unknown_cost, { n: fs.sales_with_unknown_cost }));
    if (fs.expense_count === 0 && fs.sales_count > 0 && periodDays(task.period) >= 7) r.warnings.push(ctx.t.warn.no_expenses);
    return r;
  },
};
