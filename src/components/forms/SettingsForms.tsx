'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { signOut } from '@/lib/actions/auth';
import { createTelegramCode, setAgentEnabled, setTheme, switchBusiness, updateBusiness, updateReportSettings } from '@/lib/actions/business';
import type { Dict } from '@/lib/i18n';
import { ALL_MODULES, type Business } from '@/lib/types';
import { Icon } from '../icons';
import { initials } from '../ui';
import { useAction } from '../useAction';

export function ThemePicker({ t, theme }: { t: Dict; theme: string }) {
  const [cur, setCur] = useState(theme);
  const [, start] = useTransition();
  const apply = (v: string) => {
    setCur(v);
    const resolved = v === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : v;
    document.documentElement.dataset.theme = resolved;
    start(() => setTheme(v));
  };
  return (
    <div className="seg">
      {(['dark', 'light', 'system'] as const).map((v) => <button key={v} type="button" aria-pressed={cur === v} onClick={() => apply(v)}>{t.settings[v]}</button>)}
    </div>
  );
}

export function BusinessSwitcher({ t, current, list }: { t: Dict; current: string; list: { id: string; name: string; type: Business['type']; role: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="card card-flush list">
      {list.map((b) => (
        <button key={b.id} type="button" className="list-row" disabled={pending || b.id === current} onClick={() => start(() => switchBusiness(b.id))}>
          <div className="avatar ic-blue">{initials(b.name)}</div>
          <div className="grow"><div className="row-title truncate">{b.name}</div><div className="row-sub">{t.btype[b.type]} · {b.role === 'owner' ? t.emp.owner : t.emp.employee}</div></div>
          {b.id === current ? <Icon name="check" width={18} style={{ color: 'var(--blue)' }} /> : <Icon name="chevron" width={18} className="faint" />}
        </button>
      ))}
    </div>
  );
}

export function BusinessSettingsForm({ t, business }: { t: Dict; business: Business }) {
  const { run, pending, error, ok } = useAction(updateBusiness);
  return (
    <form className="card stack" action={(f) => run(f)}>
      <label className="field"><span>{t.onboarding.businessName}</span><input className="input" name="name" defaultValue={business.name} required maxLength={120} /></label>
      <div className="grid-2">
        <label className="field"><span>{t.onboarding.currency}</span>
          <select className="select" name="currency" defaultValue={business.currency}>{['KGS', 'UZS', 'KZT', 'RUB', 'USD'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field"><span>{t.onboarding.language}</span>
          <select className="select" name="language" defaultValue={business.language}><option value="ky">Кыргызча</option><option value="uz">Oʻzbekcha</option><option value="ru">Русский</option></select></label>
      </div>
      <label className="field"><span>{t.settings.timezone}</span>
        <select className="select" name="timezone" defaultValue={business.timezone}>
          {['Asia/Bishkek', 'Asia/Tashkent', 'Asia/Almaty', 'Asia/Dushanbe', 'Europe/Moscow'].map((z) => <option key={z}>{z}</option>)}
        </select></label>
      {business.type === 'custom' && (
        <div className="stack-sm"><div className="label">{t.settings.modules}</div>
          {ALL_MODULES.filter((m) => m !== 'sales').map((m) => <label key={m} className="check"><span className="small">{t.modules[m]}</span><input type="checkbox" name="modules" value={m} defaultChecked={business.modules.includes(m)} /></label>)}
        </div>
      )}
      <label className="check"><span className="small">{t.settings.negativeStock}</span><input type="checkbox" name="allow_negative_stock" defaultChecked={business.allow_negative_stock} /></label>
      {error && <div className="form-error">{error}</div>}
      {ok && <div className="form-ok">{ok}</div>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? t.common.loading : t.common.save}</button>
    </form>
  );
}

export function ReportSettingsForm({ t, business }: { t: Dict; business: Business }) {
  const { run, pending, error, ok } = useAction(updateReportSettings);
  return (
    <form className="card stack" action={(f) => run(f)}>
      <div className="grid-2">
        <label className="field"><span>{t.settings.reportTime}</span><input className="input" type="time" name="report_time" defaultValue={business.report_time.slice(0, 5)} step={3600} /></label>
        <label className="field"><span>{t.settings.channel}</span>
          <select className="select" name="report_channel" defaultValue={business.report_channel}>
            <option value="in_app">{t.settings.ch_in_app}</option><option value="telegram">{t.settings.ch_telegram}</option><option value="none">{t.settings.ch_none}</option>
          </select></label>
      </div>
      {error && <div className="form-error">{error}</div>}
      {ok && <div className="form-ok">{ok}</div>}
      <button className="btn btn-secondary btn-block" disabled={pending}>{t.common.save}</button>
    </form>
  );
}

export function TelegramConnect({ t, connected, configured, botName }: { t: Dict; connected: boolean; configured: boolean; botName: string }) {
  const [code, setCode] = useState<string | null>(null);
  const { run, pending, error } = useAction(createTelegramCode);
  if (!configured) return <div className="notice"><Icon name="alert" /><span>{t.settings.tgNotConfigured}</span></div>;
  return (
    <div className="card stack">
      {connected && <div className="form-ok"><span className="row" style={{ gap: 8 }}><Icon name="check" width={18} />{t.settings.tgConnected}</span></div>}
      {code ? (
        <>
          <p className="small muted">{t.settings.tgHow}</p>
          <div className="kbd">/start {code}</div>
          {botName && <a className="btn btn-primary btn-block" href={`https://t.me/${botName}?start=${code}`} target="_blank" rel="noreferrer"><Icon name="telegram" />@{botName}</a>}
        </>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" disabled={pending} onClick={async () => { const r = await run(); if (r.ok && r.data) setCode(r.data); }}>
          <Icon name="telegram" />{t.settings.tgConnect}
        </button>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function AgentToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input type="checkbox" role="switch" aria-label={id} checked={on} disabled={pending} style={{ width: 22, height: 22, accentColor: 'var(--blue)' }}
      onChange={(e) => { const v = e.target.checked; setOn(v); start(async () => { await setAgentEnabled(id, v); router.refresh(); }); }} />
  );
}

export function SignOutButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-secondary btn-block" disabled={pending} onClick={() => start(() => signOut())}><Icon name="logout" />{label}</button>;
}
