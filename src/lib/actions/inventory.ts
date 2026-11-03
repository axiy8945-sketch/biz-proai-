'use server';
import { UNITS } from '../types';
import { bool, numVal, oneOf, str, uuid } from '../validate';
import { run, unwrap } from './_run';

const KINDS = ['product', 'ingredient', 'finished', 'device', 'accessory'] as const;

export async function createProduct(form: FormData) {
  return run(async (ctx, sb) => unwrap(await sb.rpc('create_product', {
    p_business: ctx.business.id,
    p_name: str(form.get('name'), { max: 160 }),
    p_kind: oneOf(form.get('kind'), KINDS, 'product'),
    p_unit: oneOf(form.get('unit'), UNITS, 'pcs'),
    p_sale_price: numVal(form.get('sale_price'), { optional: true }),
    p_cost_price: numVal(form.get('cost_price'), { optional: true }),
    p_stock: numVal(form.get('stock'), { optional: true }),
    p_min_stock: numVal(form.get('min_stock'), { optional: true }),
    p_category: str(form.get('category'), { max: 80, optional: true }) || null,
    p_sku: str(form.get('sku'), { max: 80, optional: true }) || null,
    p_track_serial: bool(form.get('track_serial')),
  })), (ctx) => ctx.t.inv.productSaved);
}

export async function updateProduct(id: string, form: FormData) {
  return run(async (ctx, sb) => {
    const res = await sb.from('products').update({
      name: str(form.get('name'), { max: 160 }),
      sale_price: numVal(form.get('sale_price'), { optional: true }),
      min_stock: numVal(form.get('min_stock'), { optional: true }),
      category: str(form.get('category'), { max: 80, optional: true }) || null,
      active: form.get('active') === null ? true : bool(form.get('active')),
    }).eq('id', uuid(id)).eq('business_id', ctx.business.id).select('id');
    if (!unwrap<{ id: string }[] | null>(res)?.length) throw new Error('forbidden');
  }, (ctx) => ctx.t.inv.productSaved);
}

export async function adjustStock(id: string, newStock: number, note: string) {
  return run(async (_ctx, sb) => {
    unwrap(await sb.rpc('adjust_stock', { p_product: uuid(id), p_new_stock: numVal(newStock, { max: 1e9 }), p_note: str(note, { max: 300, optional: true }) || null }));
  }, (ctx) => ctx.t.common.saved);
}

export async function recordPurchase(input: { supplier?: string; note?: string; requestId: string; lines: { productId: string; quantity: number; unitCost: number; serials?: string[] }[] }) {
  return run(async (ctx, sb) => {
    if (!input.lines?.length || input.lines.length > 100) throw new Error('invalid_items');
    const items = input.lines.map((l) => ({
      product_id: uuid(l.productId),
      quantity: numVal(l.quantity, { min: 0.001, max: 1_000_000 }),
      unit_cost: numVal(l.unitCost, { max: 1e10 }),
      ...(l.serials?.length ? { serials: l.serials.map((s) => str(s, { min: 4, max: 40 })) } : {}),
    }));
    return unwrap(await sb.rpc('record_purchase', {
      p_business: ctx.business.id, p_items: items,
      p_supplier: str(input.supplier ?? '', { max: 120, optional: true }) || null,
      p_note: str(input.note ?? '', { max: 500, optional: true }) || null,
      p_client_request_id: uuid(input.requestId),
    }));
  }, (ctx) => ctx.t.inv.purchaseSaved);
}
