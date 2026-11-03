'use client';
import { useState, useTransition } from 'react';
import { createBusiness } from '@/lib/actions/business';
import type { Dict } from '@/lib/i18n';
import { ALL_MODULES, BUSINESS_TYPES, type BusinessType, type Lang } from '@/lib/types';
import { Icon, LogoMark, type IconName } from '../icons';
import { LangSwitch } from './AuthForm';

const TYPE_ICON: Record<BusinessType, IconName> = { retail: 'store', grocery: 'apple', smartphone: 'phone', somsa: 'flame', restaurant: 'soup', bakery: 'bread', custom: 'grid' };
const TYPE_MODULES: Record<BusinessType, string[]> = {
  retail: ['sales', 'inventory', 'purchases', 'expenses', 'employees', 'reports', 'stock_alerts'],
  grocery: ['sales', 'inventory', 'purchases', 'expenses', 'employees', 'reports', 'stock_alerts'],
  smartphone: ['sales', 'inventory', 'serials', 'purchases', 'expenses', 'employees', 'reports'],
  somsa: ['sales', 'production', 'recipes', 'inventory', 'expenses', 'employees', 'reports'],
  restaurant: ['sales', 'production', 'recipes', 'inventory', 'expenses', 'employees', 'reports'],
  bakery: ['sales', 'production', 'recipes', 'inventory', 'expenses', 'employees', 'reports'],
  custom: [],
};

export function OnboardingForm({ t, lang, ownerName }: { t: Dict; lang: Lang; ownerName: string }) {
  const [type, setType] = useState<BusinessType | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="auth" style={{ justifyContent: 'flex-start' }}>
      <div className="auth-glow" />
      <div className="row between" style={{ marginBottom: 26 }}>
        <div className="logo"><LogoMark /> BizPro AI</div>
        <LangSwitch lang={lang} />
      </div>
      <h1 className="page-title" style={{ margin: '0 0 4px' }}>{t.onboarding.title}</h1>
      <p className="muted small" style={{ marginBottom: 18 }}>{t.brand.slogan}</p>
      <form action={(f) => start(async () => { setError(null); const r = await createBusiness(f); if (r && !r.ok) setError(r.error); })} className="stack">
        <div className="label">{t.onboarding.step1}</div>
        <div className="type-grid" role="radiogroup">
          {BUSINESS_TYPES.map((bt) => (
            <button key={bt} type="button" className="type-card" aria-pressed={type === bt} onClick={() => setType(bt)}>
              <Icon name={TYPE_ICON[bt]} />
              <span className="bold">{t.btype[bt]}</span>
              <span className="tiny faint">{t.btypeDesc[bt]}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type ?? ''} />
        {type && type !== 'custom' && (
          <div className="card rise" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>{t.onboarding.modulesForType}</div>
            <div className="row wrap" style={{ gap: 6 }}>{TYPE_MODULES[type].map((m) => <span key={m} className="pill pill-blue">{t.modules[m as keyof Dict['modules']]}</span>)}</div>
          </div>
        )}
        {type === 'custom' && (
          <div className="stack-sm rise">
            <div className="label">{t.onboarding.customModules}</div>
            {ALL_MODULES.filter((m) => m !== 'sales').map((m) => (
              <label key={m} className="check"><span>{t.modules[m]}</span><input type="checkbox" name="modules" value={m} defaultChecked={['inventory', 'expenses', 'reports'].includes(m)} /></label>
            ))}
          </div>
        )}
        {type && (
          <div className="stack rise">
            <div className="label" style={{ marginTop: 6 }}>{t.onboarding.step2}</div>
            <label className="field"><span>{t.onboarding.businessName}</span><input className="input" name="name" required maxLength={120} /></label>
            <label className="field"><span>{t.auth.fullName}</span><input className="input" name="owner_name" defaultValue={ownerName} maxLength={120} /></label>
            <div className="grid-2">
              <label className="field"><span>{t.onboarding.currency}</span>
                <select className="select" name="currency" defaultValue="KGS">{['KGS', 'UZS', 'KZT', 'RUB', 'USD'].map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="field"><span>{t.onboarding.language}</span>
                <select className="select" name="language" defaultValue={lang}><option value="ky">Кыргызча</option><option value="uz">Oʻzbekcha</option><option value="ru">Русский</option></select>
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={pending}>{pending ? t.common.loading : t.onboarding.create}</button>
          </div>
        )}
      </form>
    </div>
  );
}
