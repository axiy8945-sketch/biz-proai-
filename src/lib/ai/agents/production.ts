// PRODUCTION AGENT — batches, material consumption and production cost.
// Stock deduction itself happens atomically in record_production() with an
// idempotency key, so this agent only reads and explains.
import type { ProductionSummary } from '../../types';
import type { Agent } from '../types';
import { deniedReport, fmt, isPermissionError, m, num, periodLabel, report } from './util';

export const productionAgent: Agent = {
  id: 'production',
  module: 'production',
  async run(ctx, task) {
    const r = report('production', task);
    if (!ctx.perms.record_production && !ctx.perms.view_finance) return deniedReport(ctx, 'production', task);
    const pl = periodLabel(ctx, task.period);
    let ps: ProductionSummary;
    try {
      ps = await ctx.data.call<ProductionSummary>('fn_production_summary', { p_business: ctx.businessId, p_from: task.period.from, p_to: task.period.to });
    } catch (e) {
      if (isPermissionError(e)) return deniedReport(ctx, 'production', task);
      throw e;
    }
    r.data.production = ps;
    if (!ps.batches) { r.status = 'empty'; r.text.push(fmt(ctx.t.tpl.noProduction, { period: pl })); return r; }

    r.text.push(fmt(ctx.t.tpl.prodHead, { period: pl, batches: ps.batches }));
    ps.by_product.forEach((p) => r.text.push(fmt(ctx.t.tpl.prodLine, {
      name: p.name, qty: num(p.quantity),
      cost: p.material_cost !== null ? fmt(ctx.t.tpl.prodCost, { cost: m(ctx, p.material_cost), unit: m(ctx, p.unit_cost) }) : '',
    })));
    if (ps.consumption.length) {
      r.text.push(ctx.t.tpl.consHead);
      ps.consumption.slice(0, 10).forEach((c) => r.text.push(fmt(ctx.t.tpl.consLine, {
        name: c.name, qty: num(c.quantity, 3), unit: ctx.t.unit[c.unit as keyof typeof ctx.t.unit] ?? c.unit,
      })));
    }
    if (ps.material_cost !== null) r.facts.push({ label: ctx.t.prod.materialCost, value: m(ctx, ps.material_cost) });
    r.facts.push({ label: ctx.t.prod.batches, value: String(ps.batches) });
    if (ps.by_product.some((p) => !p.cost_complete)) r.warnings.push(ctx.t.warn.production_incomplete);
    return r;
  },
};
