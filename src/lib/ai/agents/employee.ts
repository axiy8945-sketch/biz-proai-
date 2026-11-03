// EMPLOYEE AGENT — sales per employee and in-app activity (records created/edited).
// Employees only ever see their own numbers; activity is owner-only (enforced in SQL).
import { dateTime } from '../../format';
import type { EmployeeActivity, EmployeeSales } from '../../types';
import type { Agent } from '../types';
import { deniedReport, fmt, isPermissionError, m, periodLabel, report } from './util';

export const employeeAgent: Agent = {
  id: 'employee',
  async run(ctx, task) {
    const r = report('employee', task);
    const args = { p_business: ctx.businessId, p_from: task.period.from, p_to: task.period.to };
    const pl = periodLabel(ctx, task.period);

    if (task.intent === 'activity') {
      if (ctx.role !== 'owner') return deniedReport(ctx, 'employee', task);
      let act: EmployeeActivity[];
      try { act = await ctx.data.call<EmployeeActivity[]>('fn_employee_activity', args); }
      catch (e) { if (isPermissionError(e)) return deniedReport(ctx, 'employee', task); throw e; }
      r.data.activity = act;
      r.text.push(`${ctx.t.activity.title} ${pl}:`);
      act.forEach((a) => r.text.push(
        `• ${a.full_name || '—'}: +${a.created} / ✎${a.updated} / ✕${a.deleted}` +
        (a.last_activity ? ` (${dateTime(a.last_activity, ctx.lang, ctx.timezone)})` : ''),
      ));
      return r;
    }

    const rows = await ctx.data.call<EmployeeSales[]>('fn_employee_sales', args);
    r.data.employees = rows;
    if (!ctx.perms.view_finance) r.warnings.push(ctx.t.warn.own_scope);
    const withSales = rows.filter((x) => x.sales_count > 0);
    if (!withSales.length) { r.status = 'empty'; r.text.push(fmt(ctx.t.tpl.noSales, { period: pl })); return r; }
    r.text.push(fmt(ctx.t.tpl.empHead, { period: pl }));
    withSales.forEach((x, i) => r.text.push(fmt(ctx.t.tpl.empLine, { i: i + 1, name: x.full_name, revenue: m(ctx, x.revenue), count: x.sales_count })));
    r.facts.push({ label: withSales[0].full_name, value: m(ctx, withSales[0].revenue) });
    return r;
  },
};
