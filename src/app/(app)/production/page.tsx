import { redirect } from 'next/navigation';
import { ProductionView } from '@/components/views/ProductionView';
import { getAppContext } from '@/lib/context';
import { periodFor } from '@/lib/dates';
import { queries } from '@/lib/queries';
import type { RecipeFull } from '@/lib/recipes';

export const dynamic = 'force-dynamic';

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ctx = await getAppContext();
  if (!ctx.business.modules.includes('production') || (!ctx.perms.record_production && !ctx.perms.view_finance)) redirect('/dashboard');
  const sp = await searchParams;
  const q = await queries(ctx);
  const week = periodFor('last_7_days', ctx.business.timezone);
  const [products, recipesRes, summary, batchesRes] = await Promise.all([
    q.products(),
    q.sb.from('recipes').select('id,name,product_id,yield_qty,notes,recipe_items(ingredient_id,quantity)').eq('business_id', ctx.business.id).eq('active', true).order('name'),
    q.production(week.from, week.to),
    q.sb.from('production_batches').select('id,product_id,quantity,produced_at,created_by').eq('business_id', ctx.business.id).order('produced_at', { ascending: false }).limit(20),
  ]);
  const recipes: RecipeFull[] = (recipesRes.data ?? []).map((r) => ({ ...r, yield_qty: Number(r.yield_qty), items: (r.recipe_items ?? []).map((i: { ingredient_id: string; quantity: number }) => ({ ...i, quantity: Number(i.quantity) })) }));
  return <ProductionView t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} timezone={ctx.business.timezone} products={products} recipes={recipes}
    summary={summary} batches={(batchesRes.data ?? []).map((b) => ({ ...b, quantity: Number(b.quantity) }))}
    canRecord={ctx.perms.record_production} openNew={sp.new === '1'} />;
}
