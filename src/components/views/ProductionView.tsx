import Link from 'next/link';
import { ProductionSheet } from '@/components/forms/ProductionForm';
import { Bars } from '@/components/charts';
import { Icon } from '@/components/icons';
import { Empty, Notice, PageTitle, Section } from '@/components/ui';
import { dateTime, money, num } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { RecipeFull } from '@/lib/recipes';
import type { Lang, Product, ProductionSummary } from '@/lib/types';

export function ProductionView({ t, lang, currency, timezone, products, recipes, summary, batches, canRecord, openNew }: {
  t: Dict; lang: Lang; currency: string; timezone: string; products: Product[]; recipes: RecipeFull[]; summary: ProductionSummary;
  batches: { id: string; product_id: string; quantity: number; produced_at: string }[]; canRecord: boolean; openNew: boolean;
}) {
  const names = new Map(products.map((p) => [p.id, p]));
  return (
    <div className="stack">
      <PageTitle action={<Link href="/recipes" className="btn btn-secondary btn-sm"><Icon name="book" />{t.recipes.title}</Link>}>{t.prod.title}</PageTitle>
      {recipes.length === 0 && <Empty icon="book" title={t.prod.noRecipes} action={<Link href="/recipes?new=1" className="btn btn-primary"><Icon name="plus" />{t.recipes.new}</Link>} />}
      <div className="stat-grid">
        <div className="stat"><div className="label">{t.prod.batches} · {t.rep.last7}</div><div className="stat-value num">{summary.batches}</div></div>
        {summary.material_cost !== null && <div className="stat"><div className="label">{t.prod.materialCost}</div><div className="stat-value num">{money(Number(summary.material_cost), currency, lang)}</div></div>}
      </div>
      {summary.by_product.some((p) => !p.cost_complete) && <Notice>{t.warn.production_incomplete}</Notice>}
      {summary.consumption.length > 0 && (
        <Section title={`${t.prod.consumption} · ${t.rep.last7}`}>
          <div className="card"><Bars rows={summary.consumption.map((c) => ({ label: c.name, value: Number(c.quantity), display: `${num(Number(c.quantity), 3)} ${t.unit[c.unit as keyof Dict['unit']] ?? c.unit}` }))} /></div>
        </Section>
      )}
      <Section title={t.prod.batches}>
        {batches.length === 0 ? <div className="card empty muted">{t.common.noData}</div> : (
          <div className="card card-flush list">
            {batches.map((b) => (
              <div key={b.id} className="list-row">
                <div className="avatar ic-amber"><Icon name="flame" /></div>
                <div className="grow"><div className="row-title truncate">{names.get(b.product_id)?.name ?? '—'}</div><div className="row-sub">{dateTime(b.produced_at, lang, timezone)}</div></div>
                <div className="row-end num bold">+{num(b.quantity)} {t.unit[names.get(b.product_id)?.unit ?? 'pcs']}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
      {canRecord && recipes.length > 0 && <ProductionSheet t={t} recipes={recipes} products={products} defaultOpen={openNew} />}
    </div>
  );
}
