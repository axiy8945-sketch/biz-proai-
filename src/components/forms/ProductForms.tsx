'use client';
import { useMemo, useState } from 'react';
import { adjustStock, createProduct, updateProduct } from '@/lib/actions/inventory';
import { money, num } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import { UNITS, type Lang, type Product, type ProductKind } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { useAction } from '../useAction';

export function ProductList({ t, lang, currency, products, lowIds, canManage, showCost, serialsEnabled, productionEnabled, openNew }: {
  t: Dict; lang: Lang; currency: string; products: Product[]; lowIds: string[]; canManage: boolean; showCost: boolean;
  serialsEnabled: boolean; productionEnabled: boolean; openNew: boolean;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(openNew && canManage);
  const low = useMemo(() => new Set(lowIds), [lowIds]);
  const list = products.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));
  const m = (v: number | null) => money(v, currency, lang);

  return (
    <>
      <div style={{ position: 'relative' }}>
        <Icon name="search" width={18} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-3)' }} />
        <input className="input" style={{ paddingLeft: 40 }} placeholder={t.common.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.common.search} />
      </div>
      {list.length === 0 ? <div className="card empty muted">{t.common.noData}</div> : (
        <div className="card card-flush list">
          {list.map((p) => (
            <button key={p.id} type="button" className="list-row" onClick={() => setEditing(p)} style={{ opacity: p.active ? 1 : 0.5 }}>
              <div className={`avatar ${low.has(p.id) ? 'ic-amber' : 'ic-blue'}`}><Icon name={p.kind === 'ingredient' ? 'layers' : p.kind === 'device' ? 'phone' : p.kind === 'finished' ? 'flame' : 'box'} /></div>
              <div className="grow">
                <div className="row-title truncate">{p.name}</div>
                <div className="row-sub truncate">{t.kind[p.kind]}{p.kind !== 'ingredient' ? ` · ${m(p.sale_price)}` : ''}{showCost && p.cost_price !== null ? ` · ${t.inv.costPrice.toLowerCase()} ${m(p.cost_price)}` : ''}</div>
              </div>
              <div className="row-end">
                <div className={`row-title num ${low.has(p.id) ? 'warn' : ''}`}>{num(p.stock)} {t.unit[p.unit]}</div>
                <div className="row-sub num">{p.track_serial ? `IMEI: ${p.serials_in_stock}` : `${t.inv.minStock}: ${num(p.min_stock)}`}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {canManage && <button type="button" className="fab" onClick={() => setCreating(true)}><Icon name="plus" />{t.inv.newProduct}</button>}
      <Sheet open={creating} onClose={() => setCreating(false)} title={t.inv.newProduct}>
        <NewProductForm t={t} serialsEnabled={serialsEnabled} productionEnabled={productionEnabled} onDone={() => setCreating(false)} />
      </Sheet>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing && <EditProduct key={editing.id} t={t} p={editing} canManage={canManage} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function NewProductForm({ t, serialsEnabled, productionEnabled, onDone }: { t: Dict; serialsEnabled: boolean; productionEnabled: boolean; onDone: () => void }) {
  const kinds: ProductKind[] = ['product', ...(productionEnabled ? (['ingredient', 'finished'] as ProductKind[]) : []), ...(serialsEnabled ? (['device', 'accessory'] as ProductKind[]) : [])];
  const [kind, setKind] = useState<ProductKind>(productionEnabled ? 'finished' : serialsEnabled ? 'device' : 'product');
  const [serial, setSerial] = useState(serialsEnabled && kind === 'device');
  const { run, pending, error } = useAction(createProduct);
  return (
    <form className="stack" action={async (f) => { f.set('kind', kind); if (serial) f.set('track_serial', 'on'); const r = await run(f); if (r.ok) onDone(); }}>
      {kinds.length > 1 && (
        <div className="field"><span>{t.inv.kind}</span>
          <div className="row wrap" style={{ gap: 8 }}>{kinds.map((k) => <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setSerial(serialsEnabled && k === 'device'); }}>{t.kind[k]}</button>)}</div>
        </div>
      )}
      <label className="field"><span>{t.common.name}</span><input className="input" name="name" required maxLength={160} autoFocus /></label>
      <div className="grid-2">
        {kind !== 'ingredient' && <label className="field"><span>{t.inv.salePrice}</span><input className="input num" name="sale_price" inputMode="decimal" placeholder="0" /></label>}
        {kind !== 'finished' && <label className="field"><span>{t.inv.costPrice}</span><input className="input num" name="cost_price" inputMode="decimal" placeholder="0" /></label>}
        <label className="field"><span>{t.inv.unit}</span>
          <select className="select" name="unit" defaultValue={kind === 'ingredient' ? 'kg' : 'pcs'}>{UNITS.map((u) => <option key={u} value={u}>{t.unit[u]}</option>)}</select></label>
        {!serial && <label className="field"><span>{t.inv.stock}</span><input className="input num" name="stock" inputMode="decimal" placeholder="0" /></label>}
        <label className="field"><span>{t.inv.minStock}</span><input className="input num" name="min_stock" inputMode="decimal" placeholder="0" /></label>
        <label className="field"><span>{t.inv.category}</span><input className="input" name="category" maxLength={80} /></label>
      </div>
      {serialsEnabled && (kind === 'device' || kind === 'accessory') && (
        <label className="check"><span>{t.inv.trackSerial}</span><input type="checkbox" checked={serial} onChange={(e) => setSerial(e.target.checked)} /></label>
      )}
      {serial && <p className="tiny faint">{t.inv.serialStockHint}</p>}
      {error && <div className="form-error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? t.common.loading : t.common.save}</button>
    </form>
  );
}

function EditProduct({ t, p, canManage, onDone }: { t: Dict; p: Product; canManage: boolean; onDone: () => void }) {
  const upd = useAction(updateProduct.bind(null, p.id));
  const adj = useAction(adjustStock);
  const [stock, setStock] = useState(String(p.stock));
  if (!canManage) {
    return <div className="stack"><div className="row between"><span className="muted">{t.inv.stock}</span><b className="num">{num(p.stock)} {t.unit[p.unit]}</b></div></div>;
  }
  return (
    <div className="stack">
      <form className="stack" action={async (f) => { const r = await upd.run(f); if (r.ok) onDone(); }}>
        <label className="field"><span>{t.common.name}</span><input className="input" name="name" defaultValue={p.name} required maxLength={160} /></label>
        <div className="grid-2">
          {p.kind !== 'ingredient' && <label className="field"><span>{t.inv.salePrice}</span><input className="input num" name="sale_price" defaultValue={p.sale_price} inputMode="decimal" /></label>}
          <label className="field"><span>{t.inv.minStock}</span><input className="input num" name="min_stock" defaultValue={p.min_stock} inputMode="decimal" /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>{t.inv.category}</span><input className="input" name="category" defaultValue={p.category ?? ''} maxLength={80} /></label>
        </div>
        <label className="check"><span>{t.emp.active}</span><input type="checkbox" name="active" defaultChecked={p.active} value="on" /></label>
        <input type="hidden" name="active" value="" />
        {upd.error && <div className="form-error">{upd.error}</div>}
        <button className="btn btn-primary btn-block" disabled={upd.pending}>{upd.pending ? t.common.loading : t.common.save}</button>
      </form>
      {!p.track_serial && (
        <div className="card stack-sm" style={{ background: 'var(--surface-2)' }}>
          <div className="bold">{t.inv.adjust}</div>
          <div className="row">
            <input className="input num grow" value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" aria-label={t.inv.newStock} />
            <span className="muted">{t.unit[p.unit]}</span>
            <button type="button" className="btn btn-secondary" disabled={adj.pending} onClick={async () => {
              const v = Number(stock.replace(',', '.'));
              if (!Number.isFinite(v) || v < 0) return;
              const r = await adj.run(p.id, v, 'manual count');
              if (r.ok) onDone();
            }}>{t.common.save}</button>
          </div>
          {adj.error && <div className="form-error">{adj.error}</div>}
        </div>
      )}
    </div>
  );
}
