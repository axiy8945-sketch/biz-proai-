'use client';
import { useState } from 'react';
import { voidSale } from '@/lib/actions/sales';
import type { Dict } from '@/lib/i18n';
import { Sheet } from '../Sheet';
import { useAction } from '../useAction';

export function VoidSaleButton({ saleId, t }: { saleId: string; t: Dict }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending, error } = useAction(voidSale);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px', minHeight: 30, color: 'var(--red)' }} onClick={() => setOpen(true)}>{t.sales.void}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.sales.void}>
        <div className="stack">
          <label className="field"><span>{t.sales.voidReason}</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus /></label>
          {error && <div className="form-error">{error}</div>}
          <button type="button" className="btn btn-danger btn-block" disabled={pending || reason.trim().length < 2}
            onClick={async () => { const r = await run(saleId, reason); if (r.ok) setOpen(false); }}>{pending ? t.common.loading : t.common.confirm}</button>
        </div>
      </Sheet>
    </>
  );
}
