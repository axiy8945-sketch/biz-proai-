import Link from 'next/link';
import { VoidSaleButton } from '@/components/forms/VoidSaleButton';
import { Icon } from '@/components/icons';
import { Empty, PageTitle, Seg } from '@/components/ui';
import { money, timeOnly, dateTime } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { Lang, PaymentMethod, SalesOverview } from '@/lib/types';

export interface SaleRow { id: string; total: number; payment: PaymentMethod; soldAt: string; voided: boolean; voidReason: string | null; seller: string; items: string }

export function SalesView({ t, lang, currency, timezone, periodKey, overview, rows, canVoid }: {
  t: Dict; lang: Lang; currency: string; timezone: string; periodKey: string; overview: SalesOverview; rows: SaleRow[]; canVoid: boolean;
}) {
  const m = (v: number | null) => money(v, currency, lang);
  const singleDay = periodKey === 'today' || periodKey === 'yesterday';
  return (
    <div className="stack">
      <PageTitle>{t.sales.title}</PageTitle>
      <Seg current={periodKey} items={[
        { key: 'today', label: t.common.today, href: '/sales?p=today' },
        { key: 'yesterday', label: t.common.yesterday, href: '/sales?p=yesterday' },
        { key: 'last_7_days', label: t.rep.last7, href: '/sales?p=last_7_days' },
        { key: 'this_month', label: t.common.month, href: '/sales?p=this_month' },
      ]} />
      <div className="stat-grid">
        <div className="stat"><div className="label">{t.rep.revenue}</div><div className="stat-value num">{m(Number(overview.revenue))}</div></div>
        <div className="stat"><div className="label">{t.dash.sales} · {t.dash.avgTicket}</div><div className="stat-value num">{overview.sales_count} · {m(overview.avg_ticket)}</div></div>
      </div>
      {overview.scope === 'own' && <p className="tiny faint">{t.warn.own_scope}</p>}
      {rows.length === 0 ? (
        <Empty icon="cart" title={t.common.noData} action={<Link href="/sales/new" className="btn btn-primary"><Icon name="plus" />{t.sales.new}</Link>} />
      ) : (
        <div className="card card-flush list">
          {rows.map((s) => (
            <div key={s.id} className="list-row" style={{ alignItems: 'flex-start', opacity: s.voided ? 0.55 : 1 }}>
              <div className="avatar ic-blue"><Icon name="receipt" /></div>
              <div className="grow">
                <div className="row-title" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{s.items || '—'}</div>
                <div className="row-sub">{singleDay ? timeOnly(s.soldAt, timezone) : dateTime(s.soldAt, lang, timezone)} · {t.pay[s.payment]} · {s.seller}</div>
                {s.voided && <div className="tiny down">{t.sales.voided}{s.voidReason ? `: ${s.voidReason}` : ''}</div>}
              </div>
              <div className="row-end">
                <div className="row-title num" style={{ textDecoration: s.voided ? 'line-through' : 'none' }}>{m(s.total)}</div>
                {canVoid && !s.voided && <VoidSaleButton saleId={s.id} t={t} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <Link href="/sales/new" className="fab"><Icon name="plus" />{t.sales.new}</Link>
    </div>
  );
}
