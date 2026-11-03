import { ExpensesView } from '@/components/views/ExpensesView';
import { getAppContext } from '@/lib/context';
import { periodFor, type PeriodKey } from '@/lib/dates';
import { queries } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const KEYS: PeriodKey[] = ['today', 'last_7_days', 'this_month', 'last_month'];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ p?: string; new?: string }> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  const key = KEYS.includes(sp.p as PeriodKey) ? (sp.p as PeriodKey) : 'this_month';
  const period = periodFor(key, ctx.business.timezone);
  const q = await queries(ctx);
  const [breakdown, list, members] = await Promise.all([
    q.expenses(period.from, period.to),
    q.sb.from('expenses').select('id,category,amount,note,spent_on,created_by,created_at').eq('business_id', ctx.business.id)
      .gte('spent_on', period.from).lte('spent_on', period.to).order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(300),
    q.sb.from('memberships').select('user_id,full_name').eq('business_id', ctx.business.id),
  ]);
  const names = new Map((members.data ?? []).map((m) => [m.user_id, m.full_name]));
  return (
    <ExpensesView t={ctx.t} lang={ctx.lang} currency={ctx.business.currency} periodKey={key} today={ctx.today} breakdown={breakdown}
      rows={(list.data ?? []).map((e) => ({ ...e, amount: Number(e.amount), by: names.get(e.created_by) ?? '' }))}
      canAdd={ctx.perms.add_expenses} canDelete={ctx.perms.delete_records} openNew={sp.new === '1'} />
  );
}
