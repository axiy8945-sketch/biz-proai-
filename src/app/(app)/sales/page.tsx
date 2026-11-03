import { SalesView, type SaleRow } from '@/components/views/SalesView';
import { getAppContext } from '@/lib/context';
import { addDays, periodFor, type PeriodKey } from '@/lib/dates';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const KEYS: PeriodKey[] = ['today', 'yesterday', 'last_7_days', 'this_month'];

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  const key = KEYS.includes(sp.p as PeriodKey) ? (sp.p as PeriodKey) : 'today';
  const period = periodFor(key, ctx.business.timezone);
  const q = await queries(ctx);
  const tz = ctx.business.timezone;
  const start = new Date(new Date(`${period.from}T00:00:00Z`).getTime() - 14 * 3600_000).toISOString();
  const end = new Date(new Date(`${addDays(period.to, 1)}T00:00:00Z`).getTime() + 14 * 3600_000).toISOString();
  const [overview, salesRes, membersRes, productsRes] = await Promise.all([
    q.overview(period.from, period.to),
    q.sb.from('sales').select('id,total,payment_method,note,sold_at,voided,void_reason,created_by,sale_items(quantity,product_id,serial)')
      .eq('business_id', ctx.business.id).gte('sold_at', start).lt('sold_at', end).order('sold_at', { ascending: false }).limit(300),
    q.sb.from('memberships').select('user_id,full_name').eq('business_id', ctx.business.id),
    q.sb.from('products').select('id,name,unit').eq('business_id', ctx.business.id),
  ]);
  const names = new Map((membersRes.data ?? []).map((m) => [m.user_id, m.full_name]));
  const pnames = new Map((productsRes.data ?? []).map((p) => [p.id, p.name]));
  const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
  const rows: SaleRow[] = (salesRes.data ?? [])
    .filter((s) => { const d = localDate(s.sold_at); return d >= period.from && d <= period.to; })
    .map((s) => ({
      id: s.id, total: Number(s.total), payment: s.payment_method, soldAt: s.sold_at, voided: s.voided, voidReason: s.void_reason,
      seller: names.get(s.created_by) ?? (s.created_by === ctx.userId ? ctx.membership.full_name : '—'),
      items: (s.sale_items ?? []).map((i: { quantity: number; product_id: string; serial: string | null }) => `${pnames.get(i.product_id) ?? '?'}${i.serial ? ` (${i.serial})` : ` ×${Number(i.quantity)}`}`).join(', '),
    }));
  return <SalesView t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} timezone={tz} periodKey={key} overview={overview} rows={rows} canVoid={ctx.perms.delete_records} />;
}
