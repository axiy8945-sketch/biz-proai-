// INVENTORY AGENT — stock levels, low stock, restock suggestions (from real 14-day usage),
// ingredient stock for production businesses.
import type { InventoryStatus, ProductLookup } from '../../types';
import type { Agent } from '../types';
import { fmt, m, num, report } from './util';

export const inventoryAgent: Agent = {
  id: 'inventory',
  module: 'inventory',
  async run(ctx, task) {
    const r = report('inventory', task);
    const unit = (u: string) => ctx.t.unit[u as keyof typeof ctx.t.unit] ?? u;

    if (task.intent === 'product_stock' && task.product) {
      const found = await ctx.data.call<ProductLookup[]>('fn_product_lookup', { p_business: ctx.businessId, p_query: task.product });
      r.data.products = found;
      if (!found.length) { r.status = 'empty'; r.text.push(fmt(ctx.t.tpl.productNotFound, { q: task.product })); return r; }
      for (const p of found.slice(0, 5)) {
        r.text.push(fmt(ctx.t.tpl.productStock, { name: p.name, stock: num(p.stock), unit: unit(p.unit), price: m(ctx, p.sale_price) }));
      }
      return r;
    }

    const inv = await ctx.data.call<InventoryStatus>('fn_inventory_status', { p_business: ctx.businessId });
    r.data.inventory = inv;
    if (inv.product_count === 0) { r.status = 'empty'; r.text.push(ctx.t.warn.no_products); r.warnings.push(ctx.t.warn.no_products); return r; }

    if (task.intent === 'value') {
      if (inv.inventory_value !== null) r.text.push(fmt(ctx.t.tpl.invValue, { value: m(ctx, inv.inventory_value) }));
      r.facts.push({ label: ctx.t.inv.value, value: m(ctx, inv.inventory_value) });
    } else if (task.intent === 'restock') {
      const need = inv.low_stock.filter((x) => Number(x.suggested_reorder) > 0);
      if (!need.length) r.text.push(ctx.t.tpl.noLow);
      else {
        r.text.push(ctx.t.tpl.restockHead);
        need.slice(0, 10).forEach((x) => r.text.push(fmt(ctx.t.tpl.restockLine, { name: x.name, qty: num(x.suggested_reorder), unit: unit(x.unit) })));
      }
    } else {
      if (!inv.low_stock.length) r.text.push(ctx.t.tpl.noLow);
      else {
        r.text.push(fmt(ctx.t.tpl.lowStock, { n: inv.low_stock.length }));
        inv.low_stock.slice(0, 10).forEach((x) => r.text.push(fmt(ctx.t.tpl.lowLine, {
          name: x.name, stock: num(x.stock), unit: unit(x.unit), min: num(x.min_stock),
          days: x.days_left !== null ? fmt(ctx.t.tpl.lowDays, { d: num(x.days_left, 1) }) : '',
        })));
      }
    }
    r.facts.push({ label: ctx.t.dash.lowStock, value: String(inv.low_stock.length), tone: inv.low_stock.length ? 'warn' : 'neutral' });

    if (inv.without_min_stock > 0) r.warnings.push(fmt(ctx.t.warn.no_min_stock, { n: inv.without_min_stock }));
    if (inv.without_cost > 0 && ctx.perms.view_finance) r.warnings.push(fmt(ctx.t.warn.products_no_cost, { n: inv.without_cost }));
    return r;
  },
};
