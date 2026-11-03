import { SaleComposer } from '@/components/forms/SaleComposer';
import { getAppContext } from '@/lib/context';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  const ctx = await getAppContext();
  const q = await queries(ctx);
  const products = await q.products();
  const tracked = products.filter((p) => p.track_serial).map((p) => p.id);
  const serials: Record<string, string[]> = {};
  if (tracked.length) {
    const { data } = await q.sb.from('product_serials').select('product_id,serial').eq('business_id', ctx.business.id)
      .eq('status', 'in_stock').in('product_id', tracked).order('created_at').limit(2000);
    for (const s of data ?? []) (serials[s.product_id] ??= []).push(s.serial);
  }
  return <SaleComposer t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} products={products} serials={serials}
    canEditPrice={ctx.perms.edit_prices} allowNegative={ctx.business.allow_negative_stock} />;
}
