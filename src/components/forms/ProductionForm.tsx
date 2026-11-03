'use client';
import { useRef, useState } from 'react';
import { recordProduction } from '@/lib/actions/production';
import { num } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { RecipeFull } from '@/lib/recipes';
import type { Product } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { requestId, useAction } from '../useAction';

export function ProductionSheet({ t, recipes, products, defaultOpen }: { t: Dict; recipes: RecipeFull[]; products: Product[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const reqId = useRef(requestId());
  const { run, pending, error } = useAction(recordProduction);
  const byId = new Map(products.map((p) => [p.id, p]));
  const recipe = recipes.find((r) => r.id === recipeId);
  const q = Number(qty.replace(',', '.'));
  const factor = recipe && q > 0 ? q / recipe.yield_qty : 0;
  return (
    <>
      <button type="button" className="fab" onClick={() => setOpen(true)}><Icon name="plus" />{t.prod.record}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.prod.record}>
        <div className="stack">
          <label className="field"><span>{t.prod.recipe}</span>
            <select className="select" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
          <label className="field"><span>{t.prod.quantity}{recipe ? ` — ${byId.get(recipe.product_id)?.name ?? ''}` : ''}</span>
            <input className="input input-lg num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={recipe ? String(recipe.yield_qty) : '0'} /></label>
          {recipe && factor > 0 && (
            <div className="card card-flush list">
              <div className="list-row"><span className="label">{t.prod.willConsume}</span></div>
              {recipe.items.map((i) => {
                const ing = byId.get(i.ingredient_id);
                const need = Math.round(i.quantity * factor * 1000) / 1000;
                const short = ing && ing.stock < need;
                return (
                  <div key={i.ingredient_id} className="list-row">
                    <div className="grow"><div className="row-title truncate">{ing?.name ?? '—'}</div><div className="row-sub num">{t.inv.stock}: {num(ing?.stock ?? 0)}</div></div>
                    <div className={`row-end num bold ${short ? 'down' : ''}`}>−{num(need, 3)} {ing ? t.unit[ing.unit] : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="button" className="btn btn-primary btn-block" disabled={pending || !recipe || !(q > 0)} onClick={async () => {
            const r = await run({ recipeId, quantity: q, requestId: reqId.current });
            if (r.ok) { reqId.current = requestId(); setQty(''); setOpen(false); }
          }}>{pending ? t.common.loading : t.common.save}</button>
        </div>
      </Sheet>
    </>
  );
}
