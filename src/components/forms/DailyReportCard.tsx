'use client';
import { useState } from 'react';
import { generateDailyReport } from '@/lib/actions/reports';
import type { Dict } from '@/lib/i18n';
import { Icon } from '../icons';
import { useAction } from '../useAction';

export function DailyReportCard({ t, today, canSend }: { t: Dict; today: string; canSend: boolean }) {
  const [date, setDate] = useState(today);
  const [text, setText] = useState<string | null>(null);
  const { run, pending, error, ok } = useAction(generateDailyReport);
  return (
    <div className="card stack">
      <div className="row">
        <input className="input grow" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label={t.expenses.date} />
        <button type="button" className="btn btn-primary" disabled={pending} onClick={async () => { const r = await run(date, false); if (r.ok && r.data) setText(r.data.text); }}>
          <Icon name="sparkles" />{t.rep.generate}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {text && <pre className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, fontFamily: 'inherit', background: 'var(--surface-2)', padding: 14, borderRadius: 14 }}>{text}</pre>}
      {text && canSend && (
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(date, true)}><Icon name="telegram" />{t.rep.send}</button>
      )}
      {ok && <div className="form-ok">{ok}</div>}
    </div>
  );
}
