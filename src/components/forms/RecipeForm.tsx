'use client';
import { useState } from 'react';
import { saveRecipe } from '@/lib/actions/production';
import { num } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import type { RecipeFull } from '@/lib/recipes';
import type { Product } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { useAction } from '../useAction';

export function RecipesManager({ t, recipes, products, canEdit, openNew }: { t: Dict; recipes: RecipeFull[]; products: Product[]; canEdit: boolean; openNew: boolean }) {
  const [editing, setEditing] = useState<RecipeFull | 'new' | null>(openNew && canEdit ? 'new' : null);
  const byId = new Map(products.map((p) => [p.id, p]));
  return (
    <>
      {recipes.length === 0 ? <div className="card empty muted">{t.common.noData}</div> : (
        <div className="card card-flush list">
          {recipes.map((r) => (
            <button key={r.id} type="button" className="list-row" onClick={() => canEdit && setEditing(r)}>
              <div className="avatar ic-violet"><Icon name="book" /></div>
              <div className="grow">
                <div className="row-title truncate">{r.name}</div>
                <div className="row-sub truncate">{byId.get(r.product_id)?.name} · {num(r.yield_qty)} {t.unit[byId.get(r.product_id)?.unit ?? 'pcs']} / {t.recipes.perBatch} · {r.items.length} {t.recipes.ingredients.toLowerCase()}</div>
              </div>
              {canEdit && <Icon name="edit" width={18} className="faint" />}
            </button>
          ))}
        </div>
      )}
      {canEdit && <button type="button" className="fab" onClick={() => setEditing('new')}><Icon name="plus" />{t.recipes.new}</button>}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t.recipes.new : editing?.name ?? ''}>
        {editing && <RecipeEditor key={editing === 'new' ? 'new' : editing.id} t={t} recipe={editing === 'new' ? null : editing} products={products} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function RecipeEditor({ t, recipe, products, onDone }: { t: Dict; recipe: RecipeFull | null; products: Product[]; onDone: () => void }) {
  const outputs = products.filter((p) => p.kind === 'finished' || p.kind === 'product');
  const ingredients = products.filter((p) => p.kind === 'ingredient' || p.kind === 'product');
  const [name, setName] = useState(recipe?.name ?? '');
  const [productId, setProductId] = useState(recipe?.product_id ?? outputs[0]?.id ?? '');
  const [yieldQty, setYield] = useState(String(recipe?.yield_qty ?? ''));
  const [items, setItems] = useState(recipe?.items.map((i) => ({ ingredientId: i.ingredient_id, quantity: String(i.quantity) })) ?? [{ ingredientId: '', quantity: '' }]);
  const { run, pending, error } = useAction(saveRecipe);
  const p = (s: string) => Number(s.replace(',', '.'));
  return (
    <div className="stack">
      <label className="field"><span>{t.common.name}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></label>
      <div className="grid-2">
        <label className="field"><span>{t.recipes.product}</span>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>{outputs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label className="field"><span>{t.recipes.yield}</span><input className="input num" inputMode="decimal" value={yieldQty} onChange={(e) => setYield(e.target.value)} /></label>
      </div>
      <div className="label">{t.recipes.ingredients}</div>
      {items.map((it, i) => {
        const ing = ingredients.find((x) => x.id === it.ingredientId);
        return (
          <div key={i} className="row">
            <select className="select grow" value={it.ingredientId} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, ingredientId: e.target.value } : x)))} aria-label={t.recipes.ingredients}>
              <option value="">…</option>
              {ingredients.filter((x) => x.id !== productId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input className="input num" style={{ width: 92 }} inputMode="decimal" value={it.quantity} placeholder={ing ? t.unit[ing.unit] : t.common.qty}
              onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} aria-label={t.common.qty} />
            <button type="button" className="icon-btn" aria-label={t.common.delete} onClick={() => setItems((s) => s.filter((_, j) => j !== i))}><Icon name="x" /></button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={() => setItems((s) => [...s, { ingredientId: '', quantity: '' }])}><Icon name="plus" />{t.recipes.addIngredient}</button>
      {error && <div className="form-error">{error}</div>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending || !name.trim() || !productId || !(p(yieldQty) > 0)} onClick={async () => {
        const r = await run({ id: recipe?.id, productId, name, yieldQty: p(yieldQty), items: items.filter((x) => x.ingredientId && p(x.quantity) > 0).map((x) => ({ ingredientId: x.ingredientId, quantity: p(x.quantity) })) });
        if (r.ok) onDone();
      }}>{pending ? t.common.loading : t.common.save}</button>
    </div>
  );
}
