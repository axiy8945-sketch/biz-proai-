import { BarChart, Bars, Donut, SERIES_COLORS } from '@/components/charts';
import { DailyReportCard } from '@/components/forms/DailyReportCard';
import { Change, Notice, PageTitle, Section, Stat } from '@/components/ui';
import { money, num, shortDate } from '@/lib/format';
import { fmt, type Dict } from '@/lib/i18n';
import type { DataQuality, EmployeeSales, ExpenseBreakdown, FinanceSummary, Lang, SalesOverview, SeriesPoint, TopProduct } from '@/lib/types';

export function ReportsView({ t, lang, currency, periodKey, today, finance, prevFinance, overview, series, top, employees, expenses, quality, canSendTelegram }: {
  t: Dict; lang: Lang; currency: string; periodKey: string; today: string; finance: FinanceSummary | null; prevFinance: FinanceSummary | null;
  overview: SalesOverview; series: SeriesPoint[]; top: TopProduct[]; employees: EmployeeSales[]; expenses: ExpenseBreakdown; quality: DataQuality; canSendTelegram: boolean;
}) {
  const m = (v: number | null | undefined) => money(v === null || v === undefined ? null : Number(v), currency, lang);
  const pctChange = (a?: number, b?: number) => (a !== undefined && b ? Math.round(((Number(a) - Number(b)) / Math.abs(Number(b))) * 1000) / 10 : null);
  const payments = Object.entries(overview.by_payment ?? {}).map(([k, v], i) => ({ k, v: Number(v), color: SERIES_COLORS[i] }));
  const totalPay = payments.reduce((a, p) => a + p.v, 0);
  return (
    <div className="stack">
      <PageTitle>{t.rep.title}</PageTitle>
      <nav className="seg" aria-label={t.rep.period}>
        {([['today', t.common.today], ['last_7_days', t.rep.last7], ['last_30_days', t.rep.last30], ['this_month', t.rep.thisMonth], ['last_month', t.rep.lastMonth]] as const).map(([k, label]) => (
          <a key={k} href={`/reports?p=${k}`} aria-current={periodKey === k ? 'true' : undefined}>{label}</a>
        ))}
      </nav>
      {!finance && <Notice>{t.rep.restricted}</Notice>}

      {finance ? (
        <>
          <div className="card card-hero">
            <div className="row between"><span className="label">{t.rep.net}</span><Change pct={pctChange(finance.net_profit, prevFinance?.net_profit)} /></div>
            <div className={`hero-value num ${Number(finance.net_profit) < 0 ? 'down' : ''}`}>{m(finance.net_profit)}</div>
            <div className="tiny faint" style={{ marginTop: 6 }}>{shortDate(finance.from, lang)} – {shortDate(finance.to, lang)}</div>
          </div>
          <div className="stat-grid">
            <Stat icon="trendUp" label={t.rep.revenue} value={m(finance.revenue)} sub={<Change pct={pctChange(finance.revenue, prevFinance?.revenue)} />} />
            <Stat icon="box" tone="violet" label={t.rep.cogs} value={m(finance.cogs)} />
            <Stat icon="coins" tone="green" label={t.rep.gross} value={m(finance.gross_profit)} sub={finance.gross_margin_pct !== null ? `${t.rep.margin} ${num(finance.gross_margin_pct, 1)}%` : undefined} />
            <Stat icon="wallet" tone="red" label={t.dash.expenses} value={m(finance.expenses)} />
          </div>
          {finance.sales_with_unknown_cost > 0 && <Notice>{fmt(t.warn.unknown_cost, { n: finance.sales_with_unknown_cost })}</Notice>}
        </>
      ) : (
        <div className="stat-grid">
          <Stat icon="trendUp" label={t.rep.revenue} value={m(overview.revenue)} />
          <Stat icon="cart" tone="violet" label={t.dash.sales} value={String(overview.sales_count)} />
        </div>
      )}
      {quality.days_in_period >= 3 && quality.days_with_sales < quality.days_in_period && quality.days_with_sales > 0 && (
        <p className="tiny faint">{fmt(t.warn.gaps, { d: quality.days_with_sales, total: quality.days_in_period })}</p>
      )}

      {series.length > 1 && (
        <Section title={t.rep.series}>
          <div className="card"><BarChart data={series.map((s) => Number(s.revenue))} labels={series.map((s) => shortDate(s.date, lang).split(' ')[0])} highlightLast={false} ariaLabel={t.rep.series} /></div>
        </Section>
      )}

      <div className="grid-desktop-2">
        {top.length > 0 && (
          <Section title={t.dash.topProducts}>
            <div className="card"><Bars rows={top.map((p) => ({ label: p.name, value: Number(p.revenue), display: m(p.revenue), sub: `${num(p.quantity)} ${t.unit[p.unit as keyof Dict['unit']] ?? p.unit}${p.gross_profit !== null ? ` · ${t.rep.gross.toLowerCase()} ${m(p.gross_profit)}` : ''}` }))} /></div>
          </Section>
        )}
        {payments.length > 0 && (
          <Section title={t.rep.byPayment}>
            <div className="card row" style={{ gap: 16 }}>
              <Donut parts={payments.map((p) => ({ value: p.v, color: p.color }))} label={String(overview.sales_count)} sub={t.dash.sales.toLowerCase()} size={110} />
              <div className="stack-sm grow">
                {payments.map((p) => (
                  <div key={p.k} className="row between small">
                    <span className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block' }} />{t.pay[p.k as keyof Dict['pay']] ?? p.k}</span>
                    <span className="num bold">{Math.round((p.v / (totalPay || 1)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}
        {employees.some((e) => e.sales_count > 0) && (
          <Section title={t.rep.byEmployee}>
            <div className="card"><Bars rows={employees.filter((e) => e.sales_count > 0).map((e) => ({ label: e.full_name, value: Number(e.revenue), display: m(e.revenue), sub: String(e.sales_count) }))} /></div>
          </Section>
        )}
        {expenses.by_category.length > 0 && (
          <Section title={t.rep.byCategory}>
            <div className="card"><Bars rows={expenses.by_category.map((c) => ({ label: t.ecat[c.category], value: Number(c.amount), display: m(c.amount) }))} /></div>
          </Section>
        )}
      </div>

      {finance && <Section title={t.rep.daily}><DailyReportCard t={t} today={today} canSend={canSendTelegram} /></Section>}
    </div>
  );
}
