import { redirect } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Empty, PageTitle } from '@/components/ui';
import { getAppContext } from '@/lib/context';
import { dateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const ctx = await getAppContext();
  if (!ctx.isOwner) redirect('/dashboard');
  const sb = await supabaseServer();
  const [logs, members] = await Promise.all([
    sb.from('audit_logs').select('id,actor_id,table_name,action,created_at').eq('business_id', ctx.business.id).order('created_at', { ascending: false }).limit(150),
    sb.from('memberships').select('user_id,full_name').eq('business_id', ctx.business.id),
  ]);
  const names = new Map((members.data ?? []).map((m) => [m.user_id, m.full_name]));
  const { t } = ctx;
  const rows = logs.data ?? [];
  return (
    <div className="stack">
      <PageTitle>{t.activity.title}</PageTitle>
      {rows.length === 0 ? <Empty icon="list" title={t.common.noData} /> : (
        <div className="card card-flush list">
          {rows.map((l) => (
            <div key={l.id} className="list-row">
              <div className={`avatar ${l.action === 'delete' ? 'ic-red' : l.action === 'update' ? 'ic-amber' : 'ic-blue'}`}>
                <Icon name={l.action === 'delete' ? 'x' : l.action === 'update' ? 'edit' : 'plus'} />
              </div>
              <div className="grow">
                <div className="row-title truncate">{names.get(l.actor_id ?? '') || 'System'} {t.activity[l.action as 'insert' | 'update' | 'delete'] ?? l.action} {t.tables[l.table_name as keyof typeof t.tables] ?? l.table_name}</div>
                <div className="row-sub">{dateTime(l.created_at, ctx.lang, ctx.business.timezone)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
