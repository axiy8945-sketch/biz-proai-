// BUSINESS ANALYST — compares the period with the previous one, explains what
// changed and suggests practical actions. Insights are rule-based on real
// numbers (deterministic); the coordinator's LLM may only rephrase them.
import { previousPeriod } from '../../dates';
import { shortDate } from '../../format';
import type { DataQuality, ExpenseBreakdown, FinanceSummary, InventoryStatus, SalesOverview, SeriesPoint, TopProduct } from '../../types';
import type { Agent } from '../types';
import { change, fmt, m, num, periodDays, periodLabel, report, share } from './util';

export const analystAgent: Agent = {
  id: 'analyst',
  async run(ctx, task) {
    const r = report('analyst', task);
    const t = ctx.t;
    const args = { p_business: ctx.businessId, p_from: task.period.from, p_to: task.period.to };
    const prevP = previousPeriod(task.period);
    const fin = ctx.perms.view_finance;
    const multiDay = periodDays(task.period) > 1;

    const [cur, prev, series, top, dq, inv, eb] = await Promise.all([
      fin ? ctx.data.call<FinanceSummary>('fn_finance_summary', args) : ctx.data.call<SalesOverview>('fn_sales_overview', args),
      fin ? ctx.data.call<FinanceSummary>('fn_finance_summary', { ...args, p_from: prevP.from, p_to: prevP.to })
          : ctx.data.call<SalesOverview>('fn_sales_overview', { ...args, p_from: prevP.from, p_to: prevP.to }),
      multiDay ? ctx.data.call<SeriesPoint[]>('fn_sales_series', args) : Promise.resolve([] as SeriesPoint[]),
      ctx.data.call<TopProduct[]>('fn_top_products', { ...args, p_limit: 5 }),
      ctx.data.call<DataQuality>('fn_data_quality', args),
      ctx.modules.includes('inventory') ? ctx.data.call<InventoryStatus>('fn_inventory_status', { p_business: ctx.businessId }) : Promise.resolve(null),
      fin ? ctx.data.call<ExpenseBreakdown>('fn_expense_breakdown', args) : Promise.resolve(null),
    ]);

    const insights: string[] = [];
    const recs: string[] = [];
    const revenue = Number(cur.revenue);
    r.data = { period: task.period, current: cur, previous: { ...prevP, revenue: prev.revenue }, top_products: top, data_quality: dq };

    if (!cur.sales_count) {
      r.status = 'empty';
      r.text.push(fmt(t.tpl.noSales, { period: periodLabel(ctx, task.period) }));
      if (!dq.has_products) r.warnings.push(t.warn.no_products);
      recs.push(t.rec.record_daily);
      r.recommendations = recs;
      return r;
    }

    // 1. Revenue trend vs previous equal period
    const ch = change(revenue, Number(prev.revenue));
    if (ch !== null && ch !== 0) { r.data.revenue_change_pct = ch; insights.push(fmt(ch > 0 ? t.insight.revenue_up : t.insight.revenue_down, { pct: num(Math.abs(ch), 1) })); }
    else if (ch === null) r.warnings.push(t.warn.no_history);

    // 2. Profitability (finance viewers only)
    if (fin) {
      const f = cur as FinanceSummary;
      if (f.gross_margin_pct !== null) {
        r.data.gross_margin_pct = f.gross_margin_pct;
        if (f.gross_margin_pct < 15) { insights.push(fmt(t.insight.margin_low, { pct: num(f.gross_margin_pct, 1) })); recs.push(t.rec.review_prices); }
        else insights.push(fmt(t.insight.margin_ok, { pct: num(f.gross_margin_pct, 1) }));
      }
      const ratio = share(Number(f.expenses), revenue);
      if (ratio !== null && ratio > 30) {
        r.data.expense_ratio_pct = ratio;
        insights.push(fmt(t.insight.expense_ratio_high, { pct: num(ratio, 1) }));
        const topCat = eb?.by_category[0];
        if (topCat) recs.push(fmt(t.rec.cut_expenses, { cat: t.ecat[topCat.category] }));
      }
      if (Number(f.net_profit) < 0) insights.push(fmt(t.insight.loss, { value: m(ctx, f.net_profit) }));
      if (f.sales_with_unknown_cost > 0) { r.warnings.push(fmt(t.warn.unknown_cost, { n: f.sales_with_unknown_cost })); recs.push(t.rec.fill_costs); }
      if (f.expense_count === 0 && periodDays(task.period) >= 7) r.warnings.push(t.warn.no_expenses);
    }

    // 3. Product concentration and stock risk on best sellers
    const leader = top[0];
    if (leader) {
      const s = share(Number(leader.revenue), revenue);
      if (s !== null && s >= 40 && top.length > 1) { r.data.top_share_pct = s; insights.push(fmt(t.insight.top_concentration, { name: leader.name, pct: num(s, 1) })); }
      const lowById = new Map((inv?.low_stock ?? []).map((x) => [x.product_id, x]));
      const lowTop = top.find((p) => lowById.has(p.product_id));
      if (lowTop) {
        insights.push(fmt(t.insight.top_low_stock, { name: lowTop.name }));
        const produced = lowById.get(lowTop.product_id)?.kind === 'finished';
        recs.unshift(fmt(produced ? t.rec.produce_top : t.rec.restock_top, { name: lowTop.name }));
      }
      else recs.push(fmt(t.rec.push_top, { name: leader.name }));
    }

    // 4. Weakest day (only when there is enough daily data)
    const active = series.filter((d) => Number(d.revenue) > 0);
    if (active.length >= 3) {
      const weak = active.reduce((a, b) => (Number(b.revenue) < Number(a.revenue) ? b : a));
      insights.push(fmt(t.insight.weak_day, { date: shortDate(weak.date, ctx.lang), value: m(ctx, weak.revenue) }));
    }

    // 5. Data completeness
    const startsAfterFirstSale = !dq.first_sale_date || dq.first_sale_date <= task.period.from;
    if (multiDay && dq.days_in_period >= 3 && dq.days_with_sales < dq.days_in_period && startsAfterFirstSale) {
      r.warnings.push(fmt(t.warn.gaps, { d: dq.days_with_sales, total: dq.days_in_period }));
      recs.push(t.rec.record_daily);
    }
    if (inv && inv.product_count > 0 && inv.without_min_stock / inv.product_count > 0.5) recs.push(t.rec.set_min_stock);

    r.insights = insights;
    r.recommendations = [...new Set(recs)].slice(0, 4);
    if (insights.length) r.text.push(t.tpl.insightsHead, ...insights.map((x) => '• ' + x));
    if (r.recommendations.length) r.text.push(t.tpl.recHead, ...r.recommendations.map((x) => '• ' + x));
    return r;
  },
};
