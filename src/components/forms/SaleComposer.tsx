'use client';
// Point-of-sale screen optimised for one-handed phone use:
// tap products → cart bar → checkout sheet → confirm. Safe against double taps
// (one request id per checkout; the database deduplicates it).
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { recordSale } from '@/lib/actions/sales';
import { money, num } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import { PAYMENT_METHODS, type Lang, type PaymentMethod, type Product } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { requestId, useAction } from '../useAction';

type Line = { product: Product; qty: number; price: number; serial?: string; key: string };

export function SaleComposer({ t, lang, currency, products, serials, canEditPrice, allowNegative }: {
  t: Dict; lang: Lang; currency: string; products: Product[]; serials: Record<string, string[]>; canEditPrice: boolean; allowNegative: boolean;
}) {
  const sellable = useMemo(() => products.filter((p) => p.active && p.kind !== 'ingredient'), [products]);
  const categories = useMemo(() => Array.from(new Set(sellable.map((p) => p.category).filter(Boolean))) as string[], [sellable]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const [serialFor, setSerialFor] = useState<Product | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const reqId = useRef(requestId());
  const { run, pending, error, setError } = useAction(recordSale);
  const m = (v: number) => money(v, currency, lang);

  const visibleProducts = sellable.filter((p) => (!cat || p.category === cat) && (!query || p.name.toLowerCase().includes(query.toLowerCase())));
  const qtyOf = (id: string) => lines.filter((l) => l.product.id === id).reduce((a, l) => a + l.qty, 0);
  const usedSerials = new Set(lines.map((l) => l.serial).filter(Boolean));
  const total = lines.reduce((a, l) => a + Math.round(l.qty * l.price * 100) / 100, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  function add(p: Product) {
    setDone(null);
    if (p.track_serial) { setSerialFor(p); return; }
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { product: p, qty: 1, price: p.sale_price, key: p.id }];
    });
  }
  function setQty(key: string, qty: number) {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty } : l))));
  }
  async function checkout() {
    const res = await run({
      lines: lines.map((l) => ({ productId: l.product.id, quantity: l.qty, ...(canEditPrice && l.price !== l.product.sale_price ? { unitPrice: l.price } : {}), ...(l.serial ? { serial: l.serial } : {}) })),
      payment, note, requestId: reqId.current,
    });
    if (res.ok) {
      setDone(`${t.sales.recorded} · ${m(total)}`);
      setLines([]); setNote(''); setOpen(false); setPayment('cash');
      reqId.current = requestId();
    }
  }

  return (
    <div className="stack" style={{ paddingBottom: lines.length ? 84 : 0 }}>
      <div className="row between" style={{ marginTop: 4 }}>
        <Link href="/sales" className="icon-btn" aria-label={t.common.back}><Icon name="back" /></Link>
        <h1 className="topbar-title grow" style={{ fontSize: 20 }}>{t.sales.new}</h1>
      </div>
      {done && <div className="form-ok rise" role="status"><span className="row" style={{ gap: 8 }}><Icon name="check" width={18} />{done}</span></div>}
      <label className="sr-only" htmlFor="pos-q">{t.common.search}</label>
      <div style={{ position: 'relative' }}>
        <Icon name="search" width={18} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--text-3)' }} />
        <input id="pos-q" className="input" style={{ paddingLeft: 40 }} placeholder={t.common.search} value={query} onChange={(e) => setQuery(e.target.value)} inputMode="search" />
      </div>
      {categories.length > 1 && (
        <div className="chips">
          <button type="button" className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>{t.common.all}</button>
          {categories.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="card empty"><div className="muted">{t.common.noData}</div>
          <Link href="/inventory?new=1" className="btn btn-secondary btn-sm"><Icon name="plus" />{t.dash.addProduct}</Link></div>
      ) : (
        <div className="pos-grid">
          {visibleProducts.map((p) => {
            const inCart = qtyOf(p.id);
            const available = p.track_serial ? (serials[p.id]?.length ?? 0) - inCart : p.stock - inCart;
            const disabled = !allowNegative && available <= 0;
            return (
              <button key={p.id} type="button" className="pos-item" data-in-cart={inCart > 0} disabled={disabled} onClick={() => add(p)}>
                {inCart > 0 && <span className="pos-badge num">{num(inCart)}</span>}
                <span className="bold small" style={{ lineHeight: 1.25, overflowWrap: 'anywhere' }}>{p.name}</span>
                <span>
                  <span className="bold num" style={{ display: 'block' }}>{m(p.sale_price)}</span>
                  <span className={`tiny num ${available <= p.min_stock ? 'warn' : 'faint'}`}>
                    {disabled ? t.sales.outOfStock : `${num(Math.max(available, 0))} ${t.unit[p.unit]} ${t.sales.inStock}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {lines.length > 0 && !open && (
        <div className="cart-bar">
          <div className="grow">
            <div className="tiny muted">{t.sales.cart} · {num(count)}</div>
            <div className="bold num" style={{ fontSize: 18 }}>{m(total)}</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => { setError(null); setOpen(true); }}>{t.sales.checkout}<Icon name="chevron" /></button>
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t.sales.cart}>
        <div className="stack">
          <div className="card card-flush list">
            {lines.map((l) => (
              <div key={l.key} className="list-row" style={{ flexWrap: 'wrap' }}>
                <div className="grow">
                  <div className="row-title truncate">{l.product.name}</div>
                  <div className="row-sub num">{l.serial ? `IMEI ${l.serial}` : `${m(l.price)} × ${num(l.qty)}`}</div>
                </div>
                {l.serial ? (
                  <button type="button" className="icon-btn" aria-label={t.common.delete} onClick={() => setQty(l.key, 0)}><Icon name="x" /></button>
                ) : (
                  <div className="stepper">
                    <button type="button" aria-label="−" onClick={() => setQty(l.key, l.qty - 1)}>−</button>
                    <input className="input num" inputMode="decimal" value={l.qty} aria-label={t.common.qty}
                      onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v)) setQty(l.key, v); }} />
                    <button type="button" aria-label="+" onClick={() => setQty(l.key, l.qty + 1)}>+</button>
                  </div>
                )}
                {canEditPrice && !l.serial && (
                  <label className="field" style={{ width: '100%', marginTop: 8 }}>
                    <span className="tiny">{t.sales.changePrice}</span>
                    <input className="input num" inputMode="decimal" defaultValue={l.price}
                      onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0) setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, price: v } : x))); }} />
                  </label>
                )}
              </div>
            ))}
          </div>
          <div className="field"><span>{t.sales.payment}</span>
            <div className="seg">{PAYMENT_METHODS.map((p) => <button type="button" key={p} aria-pressed={payment === p} onClick={() => setPayment(p)}>{t.pay[p]}</button>)}</div>
          </div>
          <label className="field"><span>{t.common.note} <span className="faint">({t.common.optional})</span></span>
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="row between"><span className="muted">{t.common.total}</span><span className="num bold" style={{ fontSize: 24 }}>{m(total)}</span></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="button" className="btn btn-primary btn-block" disabled={pending || !lines.length} onClick={checkout}>
            {pending ? t.common.loading : <><Icon name="check" />{t.common.confirm}</>}
          </button>
        </div>
      </Sheet>

      <Sheet open={serialFor !== null} onClose={() => setSerialFor(null)} title={t.sales.selectSerial}>
        <div className="card card-flush list">
          {(serialFor ? serials[serialFor.id] ?? [] : []).filter((s) => !usedSerials.has(s)).map((s) => (
            <button key={s} type="button" className="list-row" onClick={() => {
              if (!serialFor) return;
              setLines((ls) => [...ls, { product: serialFor, qty: 1, price: serialFor.sale_price, serial: s, key: `${serialFor.id}:${s}` }]);
              setSerialFor(null);
            }}>
              <div className="avatar"><Icon name="phone" /></div>
              <div className="grow num bold">{s}</div>
              <Icon name="plus" width={18} />
            </button>
          ))}
          {serialFor && !(serials[serialFor.id] ?? []).filter((s) => !usedSerials.has(s)).length && <div className="list-row muted">{t.sales.outOfStock}</div>}
        </div>
      </Sheet>
    </div>
  );
}
