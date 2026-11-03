'use client';
import { useState } from 'react';
import { addExpense, deleteExpense } from '@/lib/actions/expenses';
import type { Dict } from '@/lib/i18n';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { useAction } from '../useAction';

export function ExpenseSheet({ t, today, defaultOpen = false }: { t: Dict; today: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [cat, setCat] = useState<ExpenseCategory>('supplies');
  const [formKey, setFormKey] = useState(0);
  const { run, pending, error, ok } = useAction(addExpense);
  return (
    <>
      <button type="button" className="fab" onClick={() => setOpen(true)}><Icon name="plus" />{t.expenses.new}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.expenses.new}>
        <form key={formKey} className="stack" action={async (f) => { f.set('category', cat); const r = await run(f); if (r.ok) { setFormKey((k) => k + 1); setOpen(false); } }}>
          <label className="field"><span>{t.common.amount}</span>
            <input className="input input-lg num" name="amount" inputMode="decimal" required placeholder="0" autoFocus pattern="[0-9 ,.]*" /></label>
          <div className="field"><span>{t.expenses.category}</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {EXPENSE_CATEGORIES.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{t.ecat[c]}</button>)}
            </div>
          </div>
          <div className="grid-2">
            <label className="field"><span>{t.expenses.date}</span><input className="input" type="date" name="spent_on" defaultValue={today} max={today} /></label>
            <label className="field"><span>{t.common.note}</span><input className="input" name="note" maxLength={500} /></label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          {ok && <div className="form-ok">{ok}</div>}
          <button className="btn btn-primary btn-block" disabled={pending}>{pending ? t.common.loading : t.common.save}</button>
        </form>
      </Sheet>
    </>
  );
}

export function DeleteExpenseButton({ id, t }: { id: string; t: Dict }) {
  const { run, pending } = useAction(deleteExpense);
  const [ask, setAsk] = useState(false);
  return ask ? (
    <button type="button" className="btn btn-danger btn-sm" style={{ minHeight: 30 }} disabled={pending} onClick={() => run(id)}>{t.common.confirm}</button>
  ) : (
    <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 30, padding: '0 4px' }} onClick={() => setAsk(true)}>{t.common.delete}</button>
  );
}
