import { InventoryView } from '@/components/views/InventoryView';
import { getAppContext } from '@/lib/context';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ filter?: string; new?: string }> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  const q = await queries(ctx);
  const [products, status] = await Promise.all([q.products(true), q.inventory()]);
  return (
    <InventoryView t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} products={products} status={status}
      lowOnly={sp.filter === 'low'} canManage={ctx.perms.manage_inventory} showCost={ctx.perms.view_finance}
      serialsEnabled={ctx.business.modules.includes('serials')} productionEnabled={ctx.business.modules.includes('production')}
      purchasesEnabled={ctx.business.modules.includes('purchases')} openNew={sp.new === '1'} />
  );
}
