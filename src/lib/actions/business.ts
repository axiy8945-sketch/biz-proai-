'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AGENT_IDS } from '../ai/types';
import type { ActionResult } from '../errors';
import { dict, isLang } from '../i18n';
import { supabaseServer } from '../supabase/server';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../supabase/admin';
import { checkBotToken, registerTelegramWebhook } from '../telegram';
import { ALL_MODULES, BUSINESS_TYPES, type ModuleId } from '../types';
import { bool, oneOf, str, uuid } from '../validate';
import { run, unwrap } from './_run';

const CURRENCIES = ['KGS', 'UZS', 'KZT', 'RUB', 'USD'] as const;

export async function createBusiness(form: FormData): Promise<ActionResult> {
  const l = String(form.get('language') ?? 'ky');
  const t = dict(isLang(l) ? l : 'ky');
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  try {
    const type = oneOf(form.get('type'), BUSINESS_TYPES);
    const modules = type === 'custom' ? form.getAll('modules').filter((m): m is ModuleId => (ALL_MODULES as string[]).includes(String(m))) : null;
    const { error } = await sb.rpc('create_business', {
      p_name: str(form.get('name'), { max: 120 }), p_type: type, p_currency: oneOf(form.get('currency'), CURRENCIES, 'KGS'),
      p_language: isLang(l) ? l : 'ky', p_owner_name: str(form.get('owner_name'), { max: 120, optional: true }) || (user.user_metadata?.full_name ?? ''),
      p_modules: modules && modules.length ? Array.from(new Set<ModuleId>(['sales', ...modules])) : null,
    });
    if (error) return { ok: false, error: t.errors.generic };
  } catch {
    return { ok: false, error: t.common.required };
  }
  redirect('/dashboard');
}

export async function switchBusiness(id: string) {
  const sb = await supabaseServer();
  await sb.rpc('set_active_business', { p_business: uuid(id) });
  redirect('/dashboard');
}

export async function updateBusiness(form: FormData) {
  return run(async (ctx, sb) => {
    const patch: Record<string, unknown> = {
      name: str(form.get('name'), { max: 120 }),
      currency: oneOf(form.get('currency'), CURRENCIES, 'KGS'),
      language: oneOf(form.get('language'), ['ky', 'uz', 'ru'] as const, ctx.business.language),
      allow_negative_stock: bool(form.get('allow_negative_stock')),
    };
    const tz = String(form.get('timezone') ?? '');
    if (/^[A-Za-z_]+\/[A-Za-z_]+$/.test(tz)) patch.timezone = tz;
    if (ctx.business.type === 'custom') {
      const mods = form.getAll('modules').filter((m) => (ALL_MODULES as string[]).includes(String(m)));
      if (mods.length) patch.modules = Array.from(new Set(['sales', ...mods]));
    }
    const res = await sb.from('businesses').update(patch).eq('id', ctx.business.id).select('id');
    if (!unwrap<{ id: string }[] | null>(res)?.length) throw new Error('forbidden');
  }, (ctx) => ctx.t.common.saved);
}

export async function updateReportSettings(form: FormData) {
  return run(async (ctx, sb) => {
    const time = String(form.get('report_time') ?? '21:00');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('invalid_amount');
    const res = await sb.from('businesses').update({
      report_time: time,
      report_channel: oneOf(form.get('report_channel'), ['in_app', 'telegram', 'none'] as const, 'in_app'),
    }).eq('id', ctx.business.id).select('id');
    if (!unwrap<{ id: string }[] | null>(res)?.length) throw new Error('forbidden');
  }, (ctx) => ctx.t.common.saved);
}

export async function setAgentEnabled(agent: string, enabled: boolean) {
  return run(async (ctx, sb) => {
    const id = oneOf(agent, AGENT_IDS);
    const disabled = new Set(ctx.business.agent_settings.disabled ?? []);
    if (enabled) disabled.delete(id); else disabled.add(id);
    const res = await sb.from('businesses').update({ agent_settings: { ...ctx.business.agent_settings, disabled: [...disabled] } })
      .eq('id', ctx.business.id).select('id');
    if (!unwrap<{ id: string }[] | null>(res)?.length) throw new Error('forbidden');
  });
}

export async function createTelegramCode() {
  return run(async (ctx) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    const admin = supabaseAdmin();
    if (!admin) throw new Error('msg:' + ctx.t.emp.serviceKeyMissing);
    return newLinkCode(admin, ctx.business.id);
  });
}

export async function setTheme(theme: string) {
  const v = oneOf(theme, ['dark', 'light', 'system'] as const, 'dark');
  (await cookies()).set('theme', v, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (user) await sb.from('profiles').upsert({ id: user.id, theme: v }, { onConflict: 'id' });
}

/** Owner-only: connects the Telegram bot to this site (setWebhook) so the AI team answers in Telegram. */
export async function setupTelegramBot() {
  return run(async (ctx) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const res = await registerTelegramWebhook(`https://${host}`);
    if (!res.ok) throw new Error('msg:' + (res.error === 'not_configured' ? ctx.t.settings.tgNotConfigured : res.error));
    return res.username ?? '';
  });
}

/**
 * Owner pastes the BotFather token in Settings. We validate it, register the webhook with a
 * fresh secret, store it server-side (service role only) and return a one-time link code.
 */
export async function connectTelegramBot(token: string) {
  return run(async (ctx) => {
    if (!ctx.isOwner) throw new Error('owner_only');
    const admin = supabaseAdmin();
    if (!admin) throw new Error('msg:' + ctx.t.emp.serviceKeyMissing);
    try {
      const clean = String(token ?? '').trim();
      const username = await checkBotToken(clean);
      if (username === null) throw new Error('msg:' + ctx.t.settings.tgBadToken);
      const secret = randomBytes(24).toString('hex');
      const h = await headers();
      const host = h.get('x-forwarded-host') ?? h.get('host');
      const reg = await registerTelegramWebhook(`https://${host}`, clean, secret);
      if (!reg.ok) throw new Error('msg:Telegram: ' + (reg.error ?? 'error'));
      const { error } = await admin.from('telegram_bots').upsert({ business_id: ctx.business.id, token: clean, secret, username, updated_at: new Date().toISOString() });
      if (error) throw new Error('msg:' + ctx.t.settings.tgNeedSql + ' (' + error.message + ')');
      const code = await newLinkCode(admin, ctx.business.id);
      return { username, code };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      throw new Error(m.startsWith('msg:') ? m : 'msg:' + m);
    }
  });
}

/** One-time code the owner sends to the bot as "/start CODE" (generated server-side). */
async function newLinkCode(admin: NonNullable<ReturnType<typeof supabaseAdmin>>, businessId: string): Promise<string> {
  const code = randomBytes(5).toString('hex').toUpperCase();
  const { error } = await admin.from('businesses').update({ telegram_link_code: code }).eq('id', businessId);
  if (error) throw new Error('msg:' + error.message);
  return code;
}
