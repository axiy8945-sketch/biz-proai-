import { DashboardView } from '@/components/views/DashboardView';
import { getAppContext } from '@/lib/context';
import { addDays, periodFor, previousPeriod } from '@/lib/dates';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const q = await queries(ctx);
  const today = ctx.today;
  const yest = previousPeriod(periodFor('today', ctx.business.timezone));
  const fin = ctx.perms.view_finance;
  const hasInv = ctx.business.modules.includes('inventory');
  const [overview, prev, finance, series, top, inventory] = await Promise.all([
    q.overview(today, today),
    q.overview(yest.from, yest.to),
    fin ? q.finance(today, today) : Promise.resolve(null),
    q.series(addDays(today, -6), today),
    q.top(addDays(today, -6), today, 5),
    hasInv ? q.inventory() : Promise.resolve(null),
  ]);
  return (
    <DashboardView
      t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} name={ctx.membership.full_name}
      overview={overview} prevRevenue={Number(prev.revenue)} finance={finance} series={series} top={top} inventory={inventory}
      modules={ctx.business.modules} perms={ctx.perms}
    />
  );
}
