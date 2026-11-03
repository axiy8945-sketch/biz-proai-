'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { recordPurchase } from '@/lib/actions/inventory';
import { dateTime, money } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { Lang, Product } from '@/lib/types';
import { Icon } from '../icons';
import { requestId, useAction } from '../useAction';

type Line = { productId: string; quantity: string; unitCost: string; serials: string };
const blank = (): Line => ({ productId: '', quantity: '', unitCost: '', serials: '' });

export function PurchaseForm({ t, lang, currency, timezone, products, recent }: {
  t: Dict; lang: Lang; currency: string; timezone: string; products: Product[];
  recent: { id: string; supplier: string | null; total: number; purchased_at: string }[];
}) {
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [supplier, setSupplier] = useState('');
  const reqId = useRef(requestId());
  const { run, pending, error, ok } = useAction(recordPurchase);
  const byId = new Map(products.map((p) => [p.id, p]));
  const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
  const total = lines.reduce((a, l) => a + (parse(l.quantity) || 0) * (parse(l.unitCost) || 0), 0);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit() {
    const valid = lines.filter((l) => l.productId && parse(l.quantity) > 0);
    if (!valid.length) return;
    const res = await run({
      supplier, requestId: reqId.current,
      lines: valid.map((l) => ({
        productId: l.productId, quantity: parse(l.quantity), unitCost: parse(l.unitCost) || 0,
        ...(byId.get(l.productId)?.track_serial ? { serials: l.serials.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) } : {}),
      })),
    });
    if (res.ok) { setLines([blank()]); setSupplier(''); reqId.current = requestId(); }
  }

  return (
    <div className="stack">
      <div className="row" style={{ marginTop: 4 }}>
        <Link href="/inventory" className="icon-btn" aria-label={t.common.back}><Icon name="back" /></Link>
        <h1 className="topbar-title" style={{ fontSize: 20 }}>{t.inv.purchase}</h1>
      </div>
      <label className="field"><span>{t.inv.supplier} <span className="faint">({t.common.optional})</span></span>
        <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} /></label>
      {lines.map((l, i) => {
        const p = byId.get(l.productId);
        return (
          <div key={i} className="card stack-sm rise">
            <div className="row between">
              <span className="label">#{i + 1}</span>
              {lines.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon name="x" /></button>}
            </div>
            <select className="select" value={l.productId} onChange={(e) => set(i, { productId: e.target.value, unitCost: String(byId.get(e.target.value)?.cost_price ?? '') })} aria-label={t.common.name}>
              <option value="">{t.common.name}…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({t.unit[p.unit]})</option>)}
            </select>
            <div className="grid-2">
              <label className="field"><span>{t.common.qty}{p ? `, ${t.unit[p.unit]}` : ''}</span><input className="input num" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></label>
              <label className="field"><span>{t.inv.unitCost}</span><input className="input num" inputMode="decimal" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} /></label>
            </div>
            {p?.track_serial && (
              <label className="field"><span>{t.inv.serials}</span><textarea className="textarea num" value={l.serials} onChange={(e) => set(i, { serials: e.target.value })} rows={3} inputMode="numeric" /></label>
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" />{t.common.add}</button>
      <div className="row between"><span className="muted">{t.common.total}</span><b className="num" style={{ fontSize: 22 }}>{money(total, currency, lang)}</b></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending || !lines.some((l) => l.productId && parse(l.quantity) > 0)} onClick={submit}>
        {pending ? t.common.loading : t.common.save}
      </button>
      {recent.length > 0 && (
        <div className="card card-flush list" style={{ marginTop: 12 }}>
          {recent.map((r) => (
            <div key={r.id} className="list-row">
              <div className="avatar ic-amber"><Icon name="truck" /></div>
              <div className="grow"><div className="row-title truncate">{r.supplier || t.inv.purchase}</div><div className="row-sub">{dateTime(r.purchased_at, lang, timezone)}</div></div>
              <div className="row-end num bold">{money(r.total, currency, lang)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
