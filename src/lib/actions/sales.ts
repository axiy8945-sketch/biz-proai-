'use server';
import { PAYMENT_METHODS } from '../types';
import { numVal, oneOf, str, uuid } from '../validate';
import { run, unwrap } from './_run';

export interface SaleLineInput { productId: string; quantity: number; unitPrice?: number; serial?: string }

export async function recordSale(input: { lines: SaleLineInput[]; payment: string; note?: string; requestId: string }) {
  return run(async (ctx, sb) => {
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new Error('invalid_items');
    const items = input.lines.map((l) => ({
      product_id: uuid(l.productId),
      quantity: numVal(l.quantity, { min: 0.001, max: 1_000_000 }),
      ...(l.unitPrice !== undefined ? { unit_price: numVal(l.unitPrice, { max: 1e10 }) } : {}),
      ...(l.serial ? { serial: str(l.serial, { min: 4, max: 40 }) } : {}),
    }));
    return unwrap(await sb.rpc('record_sale', {
      p_business: ctx.business.id, p_items: items, p_payment_method: oneOf(input.payment, PAYMENT_METHODS),
      p_note: str(input.note ?? '', { max: 500, optional: true }) || null, p_client_request_id: uuid(input.requestId),
    }));
  }, (ctx) => ctx.t.sales.recorded);
}

export async function voidSale(saleId: string, reason: string) {
  return run(async (_ctx, sb) => {
    unwrap(await sb.rpc('void_sale', { p_sale: uuid(saleId), p_reason: str(reason, { min: 2, max: 300 }) }));
  });
}
