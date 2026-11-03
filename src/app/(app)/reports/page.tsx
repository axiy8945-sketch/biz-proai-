import { ReportsView } from '@/components/views/ReportsView';
import { getAppContext } from '@/lib/context';
import { periodFor, previousPeriod, type PeriodKey } from '@/lib/dates';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const KEYS: PeriodKey[] = ['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month'];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  const key = KEYS.includes(sp.p as PeriodKey) ? (sp.p as PeriodKey) : 'last_7_days';
  const period = periodFor(key, ctx.business.timezone);
  const prev = previousPeriod(period);
  const q = await queries(ctx);
  const fin = ctx.perms.view_finance;
  const [finance, prevFinance, overview, series, top, employees, expenses, quality] = await Promise.all([
    fin ? q.finance(period.from, period.to) : Promise.resolve(null),
    fin ? q.finance(prev.from, prev.to) : Promise.resolve(null),
    q.overview(period.from, period.to),
    q.series(period.from, period.to),
    q.top(period.from, period.to, 10),
    q.employees(period.from, period.to),
    q.expenses(period.from, period.to),
    q.quality(period.from, period.to),
  ]);
  return <ReportsView t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} periodKey={key} today={ctx.today}
    finance={finance} prevFinance={prevFinance} overview={overview} series={series} top={top} employees={employees}
    expenses={expenses} quality={quality} canSendTelegram={Boolean(ctx.business.telegram_chat_id)} />;
}
