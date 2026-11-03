import { redirect } from 'next/navigation';
import { PurchaseForm } from '@/components/forms/PurchaseForm';
import { getAppContext } from '@/lib/context';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PurchasePage() {
  const ctx = await getAppContext();
  if (!ctx.perms.manage_inventory) redirect('/inventory');
  const q = await queries(ctx);
  const products = (await q.products()).filter((p) => p.kind !== 'finished');
  const { data: recent } = await q.sb.from('purchases').select('id,supplier,total,purchased_at').eq('business_id', ctx.business.id)
    .order('purchased_at', { ascending: false }).limit(10);
  return <PurchaseForm t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} timezone={ctx.business.timezone} products={products}
    recent={(recent ?? []).map((r) => ({ ...r, total: Number(r.total) }))} />;
}
