'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ActionResult } from '../errors';
import { dict, isLang } from '../i18n';
import { supabaseServer } from '../supabase/server';
import type { Lang } from '../types';

async function lang(): Promise<Lang> {
  const v = (await cookies()).get('lang')?.value;
  return isLang(v) ? v : 'ky';
}

export async function signIn(form: FormData): Promise<ActionResult> {
  const t = dict(await lang());
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || password.length < 6) return { ok: false, error: t.auth.invalid };
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: t.auth.invalid };
  redirect('/dashboard');
}

export async function signUp(form: FormData): Promise<ActionResult> {
  const t = dict(await lang());
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const fullName = String(form.get('full_name') ?? '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: t.auth.invalid };
  if (password.length < 8) return { ok: false, error: t.auth.passwordHint };
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/callback` } });
  if (error) return { ok: false, error: /registered|exists/i.test(error.message) ? t.errors.duplicate : t.errors.generic };
  if (data.session) redirect('/onboarding');
  return { ok: true, message: t.auth.checkEmail };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}

export async function setLanguage(l: string) {
  if (!isLang(l)) return;
  (await cookies()).set('lang', l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (user) await sb.from('profiles').upsert({ id: user.id, language: l }, { onConflict: 'id' });
}
