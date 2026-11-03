import Link from 'next/link';
import { ProductList } from '@/components/forms/ProductForms';
import { Icon } from '@/components/icons';
import { Notice, PageTitle, Seg } from '@/components/ui';
import { money } from '@/lib/format';
import { fmt, type Dict } from '@/lib/i18n';
import type { InventoryStatus, Lang, Product } from '@/lib/types';

export function InventoryView({ t, lang, currency, products, status, lowOnly, canManage, showCost, serialsEnabled, productionEnabled, purchasesEnabled, openNew }: {
  t: Dict; lang: Lang; currency: string; products: Product[]; status: InventoryStatus; lowOnly: boolean; canManage: boolean; showCost: boolean;
  serialsEnabled: boolean; productionEnabled: boolean; purchasesEnabled: boolean; openNew: boolean;
}) {
  const lowIds = new Set(status.low_stock.map((x) => x.product_id));
  return (
    <div className="stack">
      <PageTitle action={canManage && purchasesEnabled ? <Link href="/inventory/purchase" className="btn btn-secondary btn-sm"><Icon name="truck" />{t.inv.purchase}</Link> : undefined}>
        {t.inv.title}
      </PageTitle>
      <div className="stat-grid">
        <div className="stat"><div className="label">{t.inv.products}</div><div className="stat-value num">{status.product_count}</div></div>
        <div className="stat"><div className="label">{t.dash.lowStock}</div><div className={`stat-value num ${status.low_stock.length ? 'warn' : ''}`}>{status.low_stock.length}</div></div>
        {showCost && status.inventory_value !== null && (
          <div className="stat" style={{ gridColumn: '1 / -1' }}><div className="label">{t.inv.value}</div><div className="stat-value num">{money(Number(status.inventory_value), currency, lang)}</div></div>
        )}
      </div>
      {showCost && status.without_cost > 0 && <Notice>{fmt(t.inv.noCostWarn, { n: status.without_cost })}</Notice>}
      <Seg current={lowOnly ? 'low' : 'all'} items={[
        { key: 'all', label: t.common.all, href: '/inventory' },
        { key: 'low', label: t.inv.lowOnly, href: '/inventory?filter=low' },
      ]} />
      <ProductList t={t} lang={lang} currency={currency} products={lowOnly ? products.filter((p) => lowIds.has(p.id)) : products}
        lowIds={[...lowIds]} canManage={canManage} showCost={showCost} serialsEnabled={serialsEnabled} productionEnabled={productionEnabled} openNew={openNew} />
    </div>
  );
}
