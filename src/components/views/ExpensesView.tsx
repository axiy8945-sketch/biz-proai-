import { Bars } from '@/components/charts';
import { DeleteExpenseButton, ExpenseSheet } from '@/components/forms/ExpenseForm';
import { Empty, Notice, PageTitle, Seg, Section } from '@/components/ui';
import { money, shortDate } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { ExpenseBreakdown, ExpenseCategory, Lang } from '@/lib/types';

export interface ExpenseRow { id: string; category: ExpenseCategory; amount: number; note: string | null; spent_on: string; by: string }

export function ExpensesView({ t, lang, currency, periodKey, today, breakdown, rows, canAdd, canDelete, openNew }: {
  t: Dict; lang: Lang; currency: string; periodKey: string; today: string; breakdown: ExpenseBreakdown; rows: ExpenseRow[];
  canAdd: boolean; canDelete: boolean; openNew: boolean;
}) {
  const m = (v: number) => money(v, currency, lang);
  return (
    <div className="stack">
      <PageTitle>{t.expenses.title}</PageTitle>
      <Seg current={periodKey} items={[
        { key: 'today', label: t.common.today, href: '/expenses?p=today' },
        { key: 'last_7_days', label: t.rep.last7, href: '/expenses?p=last_7_days' },
        { key: 'this_month', label: t.rep.thisMonth, href: '/expenses?p=this_month' },
        { key: 'last_month', label: t.rep.lastMonth, href: '/expenses?p=last_month' },
      ]} />
      <div className="card card-hero">
        <div className="label">{t.common.total}</div>
        <div className="hero-value num">{m(Number(breakdown.total))}</div>
        {breakdown.scope === 'own' && <div className="tiny faint" style={{ marginTop: 6 }}>{t.warn.own_scope}</div>}
      </div>
      {!canAdd && <Notice>{t.expenses.noPermission}</Notice>}
      {breakdown.by_category.length > 0 && (
        <Section title={t.rep.byCategory}>
          <div className="card"><Bars rows={breakdown.by_category.map((c) => ({ label: t.ecat[c.category], value: Number(c.amount), display: m(Number(c.amount)), sub: String(c.count) }))} /></div>
        </Section>
      )}
      <Section title={t.expenses.title}>
        {rows.length === 0 ? <Empty icon="wallet" title={t.common.noData} /> : (
          <div className="card card-flush list">
            {rows.map((e) => (
              <div key={e.id} className="list-row">
                <div className="avatar ic-violet">{t.ecat[e.category].slice(0, 2)}</div>
                <div className="grow">
                  <div className="row-title truncate">{t.ecat[e.category]}{e.note ? ` · ${e.note}` : ''}</div>
                  <div className="row-sub">{shortDate(e.spent_on, lang)}{e.by ? ` · ${e.by}` : ''}</div>
                </div>
                <div className="row-end">
                  <div className="row-title num">{m(e.amount)}</div>
                  {canDelete && <DeleteExpenseButton id={e.id} t={t} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      {canAdd && <ExpenseSheet t={t} today={today} defaultOpen={openNew} />}
    </div>
  );
}
