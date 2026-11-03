import Link from 'next/link';
import { BarChart, Bars } from '@/components/charts';
import { Icon } from '@/components/icons';
import { Change, Empty, Notice, Row, Section, Stat } from '@/components/ui';
import { compact, money, num, shortDate } from '@/lib/format';
import { fmt, type Dict } from '@/lib/i18n';
import type { FinanceSummary, InventoryStatus, Lang, ModuleId, Permissions, SalesOverview, SeriesPoint, TopProduct } from '@/lib/types';

export interface DashboardProps {
  t: Dict; lang: Lang; currency: string; name: string;
  overview: SalesOverview; prevRevenue: number; finance: FinanceSummary | null;
  series: SeriesPoint[]; top: TopProduct[]; inventory: InventoryStatus | null;
  modules: ModuleId[]; perms: Permissions;
}

export function DashboardView({ t, lang, currency, name, overview, prevRevenue, finance, series, top, inventory, modules, perms }: DashboardProps) {
  const m = (v: number | null | undefined) => money(v === null || v === undefined ? null : Number(v), currency, lang);
  const revenue = Number(overview.revenue);
  const change = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : null;
  const own = overview.scope === 'own';
  const noProducts = inventory !== null && inventory.product_count === 0;
  const weekTotal = series.reduce((a, s) => a + Number(s.revenue), 0);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div style={{ marginTop: 4 }}>
        <div className="muted small">{t.dash.greeting}{name ? `, ${name.split(' ')[0]}` : ''} 👋</div>
      </div>

      <div className="card card-hero rise">
        <div className="row between">
          <span className="label">{own ? t.dash.yourSalesToday : t.dash.revenueToday}</span>
          <Change pct={change} />
        </div>
        <div className="hero-value num">{m(revenue)}</div>
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <span className="pill num">{overview.sales_count} {t.dash.sales.toLowerCase()}</span>
          {overview.avg_ticket !== null && <span className="pill num">{t.dash.avgTicket}: {m(overview.avg_ticket)}</span>}
        </div>
      </div>

      {finance && (
        <div className="stat-grid">
          <Stat icon="coins" tone={Number(finance.net_profit) >= 0 ? 'green' : 'red'} label={t.dash.netProfit} value={m(finance.net_profit)}
            sub={finance.gross_margin_pct !== null ? `${t.rep.margin} ${num(finance.gross_margin_pct, 1)}%` : undefined} />
          <Stat icon="wallet" tone="violet" label={t.dash.expenses} value={m(finance.expenses)} sub={`${t.rep.cogs}: ${m(finance.cogs)}`} />
        </div>
      )}
      {finance && finance.sales_with_unknown_cost > 0 && <Notice>{fmt(t.dash.incompleteCost, { n: finance.sales_with_unknown_cost })}</Notice>}

      <div className="quick">
        {modules.includes('sales') && <Link href="/sales/new"><span className="stat-icon ic-blue" style={{ margin: 0 }}><Icon name="cart" /></span>{t.dash.quickSale}</Link>}
        {modules.includes('expenses') && (perms.add_expenses) && <Link href="/expenses?new=1"><span className="stat-icon ic-violet" style={{ margin: 0 }}><Icon name="wallet" /></span>{t.dash.quickExpense}</Link>}
        {modules.includes('production') && perms.record_production
          ? <Link href="/production?new=1"><span className="stat-icon ic-amber" style={{ margin: 0 }}><Icon name="flame" /></span>{t.dash.quickProduction}</Link>
          : modules.includes('purchases') && perms.manage_inventory && <Link href="/inventory/purchase"><span className="stat-icon ic-amber" style={{ margin: 0 }}><Icon name="truck" /></span>{t.dash.quickPurchase}</Link>}
        <Link href="/ai"><span className="stat-icon ic-green" style={{ margin: 0 }}><Icon name="sparkles" /></span>{t.dash.askAi}</Link>
      </div>

      {noProducts && (
        <Empty icon="box" title={t.dash.emptyTitle} text={t.dash.emptyText}
          action={perms.manage_inventory ? <Link href="/inventory?new=1" className="btn btn-primary"><Icon name="plus" />{t.dash.addProduct}</Link> : undefined} />
      )}

      <Section title={t.dash.last7} action={<span className="small faint num">{compact(weekTotal)}</span>}>
        <div className="card" style={{ paddingBottom: 10 }}>
          <BarChart data={series.map((s) => Number(s.revenue))} labels={series.map((s) => shortDate(s.date, lang).split(' ')[0])} ariaLabel={t.dash.last7} />
        </div>
      </Section>

      <div className="grid-desktop-2">
        {top.length > 0 && (
          <Section title={t.dash.topProducts} action={<Link href="/reports">{t.nav.reports}</Link>}>
            <div className="card">
              <Bars rows={top.map((p) => ({ label: p.name, value: Number(p.revenue), display: m(p.revenue), sub: `${num(p.quantity)} ${t.unit[p.unit as keyof Dict['unit']] ?? p.unit}` }))} />
            </div>
          </Section>
        )}

        {inventory && inventory.low_stock.length > 0 && (
          <Section title={<span className="row" style={{ gap: 6 }}>{t.dash.lowStock} <span className="pill pill-warn">{inventory.low_stock.length}</span></span>}
            action={<Link href="/inventory?filter=low">{t.common.all}</Link>}>
            <div className="card card-flush list">
              {inventory.low_stock.slice(0, 5).map((x) => (
                <Row key={x.product_id} icon="alert" tone="ic-amber" title={x.name}
                  sub={x.days_left !== null ? fmt(t.inv.daysLeft, { n: num(x.days_left, 1) }) : `${t.inv.minStock}: ${num(x.min_stock)}`}
                  end={`${num(x.stock)} ${t.unit[x.unit]}`}
                  endSub={x.suggested_reorder > 0 ? fmt(t.inv.reorder, { n: num(x.suggested_reorder) }) : undefined} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
