'use server';
import { numVal, str, uuid } from '../validate';
import { run, unwrap } from './_run';

export async function saveRecipe(input: { id?: string; productId: string; name: string; yieldQty: number; notes?: string; items: { ingredientId: string; quantity: number }[] }) {
  return run(async (ctx, sb) => unwrap(await sb.rpc('save_recipe', {
    p_business: ctx.business.id,
    p_recipe: input.id ? uuid(input.id) : null,
    p_product: uuid(input.productId),
    p_name: str(input.name, { max: 160 }),
    p_yield: numVal(input.yieldQty, { min: 0.001, max: 1e6 }),
    p_items: input.items.slice(0, 60).map((i) => ({ ingredient_id: uuid(i.ingredientId), quantity: numVal(i.quantity, { min: 0.0001, max: 1e6 }) })),
    p_notes: str(input.notes ?? '', { max: 1000, optional: true }) || null,
  })), (ctx) => ctx.t.recipes.saved);
}

export async function recordProduction(input: { recipeId: string; quantity: number; note?: string; requestId: string }) {
  return run(async (ctx, sb) => unwrap(await sb.rpc('record_production', {
    p_business: ctx.business.id,
    p_recipe: uuid(input.recipeId),
    p_quantity: numVal(input.quantity, { min: 0.001, max: 1e6 }),
    p_client_request_id: uuid(input.requestId),
    p_note: str(input.note ?? '', { max: 500, optional: true }) || null,
  })), (ctx) => ctx.t.prod.recorded);
}
