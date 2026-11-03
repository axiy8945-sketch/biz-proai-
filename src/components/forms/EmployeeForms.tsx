'use client';
import { useState } from 'react';
import { addEmployee, updateEmployee } from '@/lib/actions/employees';
import { money } from '@/lib/format';
import type { Dict } from '@/lib/i18n';
import { PERMISSIONS, type Lang, type Membership } from '@/lib/types';
import { Icon } from '../icons';
import { Sheet } from '../Sheet';
import { useAction } from '../useAction';
import { Notice, initials } from '../ui';

type Member = Membership & { revenue: number; salesCount: number };

export function EmployeesManager({ t, lang, currency, members, serviceReady }: { t: Dict; lang: Lang; currency: string; members: Member[]; serviceReady: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const add = useAction(addEmployee);
  return (
    <>
      {!serviceReady && <Notice>{t.emp.serviceKeyMissing}</Notice>}
      <div className="card card-flush list">
        {members.map((m) => (
          <button key={m.id} type="button" className="list-row" onClick={() => m.role !== 'owner' && setEditing(m)} style={{ opacity: m.active ? 1 : 0.5 }}>
            <div className={`avatar ${m.role === 'owner' ? 'ic-violet' : 'ic-blue'}`}>{initials(m.full_name)}</div>
            <div className="grow">
              <div className="row-title truncate">{m.full_name || '—'}</div>
              <div className="row-sub truncate">{m.role === 'owner' ? t.emp.owner : t.emp.employee}{m.phone ? ` · ${m.phone}` : ''}{!m.active ? ` · ${t.emp.deactivate}` : ''}</div>
            </div>
            <div className="row-end"><div className="row-title num">{money(m.revenue, currency, lang)}</div><div className="row-sub">{m.salesCount} · {t.common.month.toLowerCase()}</div></div>
          </button>
        ))}
      </div>
      {created && (
        <div className="card stack-sm rise">
          <div className="form-ok">{t.emp.created}</div>
          <div className="label">{t.auth.email}</div><div className="kbd">{created.email}</div>
          <div className="label">{t.emp.tempPassword}</div><div className="kbd">{created.password}</div>
        </div>
      )}
      <button type="button" className="fab" onClick={() => setAdding(true)}><Icon name="plus" />{t.emp.new}</button>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t.emp.new}>
        <form className="stack" action={async (f) => { const r = await add.run(f); if (r.ok && r.data) { setCreated(r.data); setAdding(false); } }}>
          <label className="field"><span>{t.auth.fullName}</span><input className="input" name="full_name" required maxLength={120} /></label>
          <label className="field"><span>{t.auth.email}</span><input className="input" name="email" type="email" inputMode="email" required /></label>
          <div className="grid-2">
            <label className="field"><span>{t.emp.phone}</span><input className="input" name="phone" type="tel" inputMode="tel" maxLength={40} /></label>
            <label className="field"><span>{t.auth.password}</span><input className="input" name="password" minLength={8} placeholder="auto" /></label>
          </div>
          <PermissionChecks t={t} />
          {add.error && <div className="form-error">{add.error}</div>}
          <button className="btn btn-primary btn-block" disabled={add.pending}>{add.pending ? t.common.loading : t.common.save}</button>
        </form>
      </Sheet>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.full_name ?? ''}>
        {editing && <EditMember key={editing.id} t={t} m={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function PermissionChecks({ t, value }: { t: Dict; value?: Membership['permissions'] }) {
  return (
    <div className="stack-sm">
      <div className="label">{t.emp.permissions}</div>
      {PERMISSIONS.map((p) => (
        <label key={p} className="check"><span className="small">{t.perm[p]}</span><input type="checkbox" name={`perm_${p}`} defaultChecked={value?.[p] ?? false} /></label>
      ))}
    </div>
  );
}

function EditMember({ t, m, onDone }: { t: Dict; m: Member; onDone: () => void }) {
  const upd = useAction(updateEmployee.bind(null, m.id));
  return (
    <form className="stack" action={async (f) => { const r = await upd.run(f); if (r.ok) onDone(); }}>
      <div className="grid-2">
        <label className="field"><span>{t.auth.fullName}</span><input className="input" name="full_name" defaultValue={m.full_name} maxLength={120} /></label>
        <label className="field"><span>{t.emp.phone}</span><input className="input" name="phone" defaultValue={m.phone ?? ''} maxLength={40} /></label>
      </div>
      <label className="check"><span>{t.emp.active}</span><input type="checkbox" name="active" value="on" defaultChecked={m.active} /></label>
      <input type="hidden" name="active" value="" />
      <PermissionChecks t={t} value={m.permissions} />
      {upd.error && <div className="form-error">{upd.error}</div>}
      <button className="btn btn-primary btn-block" disabled={upd.pending}>{upd.pending ? t.common.loading : t.common.save}</button>
    </form>
  );
}
