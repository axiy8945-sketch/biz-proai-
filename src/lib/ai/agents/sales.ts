// SALES AGENT — revenue, sales counts, trends (day/week/month comparisons) and product performance.
import { previousPeriod } from '../../dates';
import { shortDate } from '../../format';
import type { DataQuality, SalesOverview, SeriesPoint, TopProduct } from '../../types';
import type { Agent } from '../types';
import { change, fmt, m, num, periodDays, periodLabel, report } from './util';

export const salesAgent: Agent = {
  id: 'sales',
  module: 'sales',
  async run(ctx, task) {
    const r = report('sales', task);
    const args = { p_business: ctx.businessId, p_from: task.period.from, p_to: task.period.to };
    const pl = periodLabel(ctx, task.period);

    if (task.intent === 'top_products') {
      const top = await ctx.data.call<TopProduct[]>('fn_top_products', { ...args, p_limit: 5 });
      r.data.top_products = top;
      if (!top.length) { r.status = 'empty'; r.text.push(fmt(ctx.t.tpl.noSales, { period: pl })); r.warnings.push(ctx.t.warn.no_sales); return r; }
      r.text.push(fmt(ctx.t.tpl.top, { period: pl }));
      top.forEach((p, i) => r.text.push(fmt(ctx.t.tpl.topLine, {
        i: i + 1, name: p.name, qty: num(p.quantity), unit: ctx.t.unit[p.unit as keyof typeof ctx.t.unit] ?? p.unit, revenue: m(ctx, p.revenue),
      })));
      r.facts.push({ label: top[0].name, value: m(ctx, top[0].revenue) });
      return r;
    }

    // revenue / trend
    const prevP = previousPeriod(task.period);
    const [ov, prev, series, dq] = await Promise.all([
      ctx.data.call<SalesOverview>('fn_sales_overview', args),
      ctx.data.call<SalesOverview>('fn_sales_overview', { ...args, p_from: prevP.from, p_to: prevP.to }),
      periodDays(task.period) > 1 ? ctx.data.call<SeriesPoint[]>('fn_sales_series', args) : Promise.resolve([] as SeriesPoint[]),
      ctx.data.call<DataQuality>('fn_data_quality', args),
    ]);
    r.data = { overview: ov, previous_period: { ...prevP, revenue: prev.revenue, sales_count: prev.sales_count }, series, data_quality: dq };

    if (ov.scope === 'own') r.warnings.push(ctx.t.warn.own_scope);
    if (ov.sales_count === 0) {
      r.status = 'empty';
      r.text.push(fmt(ctx.t.tpl.noSales, { period: pl }));
      if (!dq.has_products) r.warnings.push(ctx.t.warn.no_products);
      return r;
    }

    r.text.push(fmt(ov.scope === 'own' ? ctx.t.tpl.revenueOwn : ctx.t.tpl.revenue, {
      period: pl, revenue: m(ctx, ov.revenue), count: ov.sales_count, avg: m(ctx, ov.avg_ticket),
    }));
    r.facts.push({ label: ctx.t.rep.revenue, value: m(ctx, ov.revenue) }, { label: ctx.t.dash.sales, value: String(ov.sales_count) });

    const ch = change(Number(ov.revenue), Number(prev.revenue));
    if (ch !== null) {
      r.data.change_pct = ch;
      r.text.push(ch === 0 ? ctx.t.tpl.same : fmt(ctx.t.tpl.change, {
        dir: ch > 0 ? ctx.t.tpl.up : ctx.t.tpl.down, pct: num(Math.abs(ch), 1), prev: m(ctx, prev.revenue),
      }));
      r.facts.push({ label: ctx.t.common.vsPrev, value: `${ch > 0 ? '+' : ''}${num(ch, 1)}%`, tone: ch >= 0 ? 'up' : 'down' });
    } else if (task.intent === 'trend') {
      r.warnings.push(ctx.t.warn.no_history);
    }

    if (series.length > 1) {
      const best = series.reduce((a, b) => (Number(b.revenue) > Number(a.revenue) ? b : a));
      if (Number(best.revenue) > 0) r.text.push(fmt(ctx.t.tpl.bestDay, { date: shortDate(best.date, ctx.lang), value: m(ctx, best.revenue) }));
      const startsAfterFirstSale = !dq.first_sale_date || dq.first_sale_date <= task.period.from;
      if (dq.days_with_sales < dq.days_in_period && dq.days_in_period >= 3 && startsAfterFirstSale) {
        r.warnings.push(fmt(ctx.t.warn.gaps, { d: dq.days_with_sales, total: dq.days_in_period }));
      }
    }
    return r;
  },
};
