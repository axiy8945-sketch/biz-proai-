'use client';
import { useEffect, useId, type ReactNode } from 'react';
import { Icon } from './icons';

/** Bottom sheet on phones, centered dialog on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 className="sheet-title" id={id}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </>
  );
}
