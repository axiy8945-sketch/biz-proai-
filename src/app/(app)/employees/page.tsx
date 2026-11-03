import { redirect } from 'next/navigation';
import { EmployeesManager } from '@/components/forms/EmployeeForms';
import { PageTitle } from '@/components/ui';
import { getAppContext } from '@/lib/context';
import { periodFor } from '@/lib/dates';
import { queries } from '@/lib/queries';
import type { Membership } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  const ctx = await getAppContext();
  if (!ctx.isOwner) redirect('/dashboard');
  const q = await queries(ctx);
  const month = periodFor('this_month', ctx.business.timezone);
  const [members, sales] = await Promise.all([
    q.sb.from('memberships').select('id,business_id,user_id,role,full_name,phone,permissions,active').eq('business_id', ctx.business.id).order('role').order('full_name'),
    q.employees(month.from, month.to),
  ]);
  const byUser = new Map(sales.map((s) => [s.user_id, s]));
  return (
    <div className="stack">
      <PageTitle>{ctx.t.emp.title}</PageTitle>
      <EmployeesManager t={ctx.t} lang={ctx.lang} currency={ctx.business.currency}
        members={((members.data ?? []) as Membership[]).map((m) => ({ ...m, revenue: Number(byUser.get(m.user_id)?.revenue ?? 0), salesCount: byUser.get(m.user_id)?.sales_count ?? 0 }))}
        serviceReady={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
    </div>
  );
}
