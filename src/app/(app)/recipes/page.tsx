import { redirect } from 'next/navigation';
import { RecipesManager } from '@/components/forms/RecipeForm';
import { PageTitle } from '@/components/ui';
import { getAppContext } from '@/lib/context';
import { queries } from '@/lib/queries';
import type { RecipeFull } from '@/lib/recipes';

export const dynamic = 'force-dynamic';

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ctx = await getAppContext();
  if (!ctx.business.modules.includes('recipes')) redirect('/dashboard');
  const sp = await searchParams;
  const q = await queries(ctx);
  const [products, res] = await Promise.all([
    q.products(),
    q.sb.from('recipes').select('id,name,product_id,yield_qty,notes,recipe_items(ingredient_id,quantity)').eq('business_id', ctx.business.id).eq('active', true).order('name'),
  ]);
  const recipes: RecipeFull[] = (res.data ?? []).map((r) => ({ ...r, yield_qty: Number(r.yield_qty), items: (r.recipe_items ?? []).map((i: { ingredient_id: string; quantity: number }) => ({ ...i, quantity: Number(i.quantity) })) }));
  return (
    <div className="stack">
      <PageTitle>{ctx.t.recipes.title}</PageTitle>
      <RecipesManager t={ctx.t} recipes={recipes} products={products} canEdit={ctx.perms.manage_inventory} openNew={sp.new === '1'} />
    </div>
  );
}
