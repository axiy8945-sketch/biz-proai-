'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setLanguage, signIn, signUp } from '@/lib/actions/auth';
import type { Dict } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { LogoMark } from '../icons';

export function LangSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="seg" style={{ width: 'fit-content' }}>
      {(['ky', 'uz', 'ru'] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={l === lang} onClick={() => start(async () => { await setLanguage(l); router.refresh(); })}>
          {l === 'ky' ? 'KG' : l === 'uz' ? 'UZ' : 'RU'}
        </button>
      ))}
    </div>
  );
}

export function AuthForm({ mode, t, lang }: { mode: 'login' | 'register'; t: Dict; lang: Lang }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const submit = (form: FormData) => start(async () => {
    setError(null); setOk(null);
    const res = await (mode === 'login' ? signIn(form) : signUp(form));
    if (res && !res.ok) setError(res.error);
    if (res && res.ok && res.message) setOk(res.message);
  });
  return (
    <div className="auth">
      <div className="auth-glow" />
      <div className="row between" style={{ marginBottom: 36 }}>
        <div className="logo"><LogoMark /> BizPro AI</div>
        <LangSwitch lang={lang} />
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 780, letterSpacing: '-0.035em', lineHeight: 1.12 }}>
        <span className="grad-text">{t.brand.slogan}</span>
      </h1>
      <p className="muted" style={{ margin: '10px 0 26px' }}>{t.auth.welcome}</p>
      <form action={submit} className="stack">
        {mode === 'register' && (
          <label className="field"><span>{t.auth.fullName}</span><input className="input" name="full_name" autoComplete="name" required maxLength={120} /></label>
        )}
        <label className="field"><span>{t.auth.email}</span><input className="input" name="email" type="email" inputMode="email" autoComplete="email" required /></label>
        <label className="field">
          <span>{t.auth.password}</span>
          <input className="input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 6} required />
          {mode === 'register' && <span className="tiny faint">{t.auth.passwordHint}</span>}
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {ok && <div className="form-ok" role="status">{ok}</div>}
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? t.common.loading : mode === 'login' ? t.auth.loginCta : t.auth.registerCta}</button>
      </form>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 22 }}>
        {mode === 'login' ? t.auth.noAccount : t.auth.haveAccount}{' '}
        <Link href={mode === 'login' ? '/register' : '/login'} className="bold" style={{ color: 'var(--blue)' }}>{mode === 'login' ? t.auth.register : t.auth.login}</Link>
      </p>
    </div>
  );
}
