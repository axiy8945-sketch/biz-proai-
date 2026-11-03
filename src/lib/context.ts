import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { todayIn } from './dates';
import { dict, isLang, type Dict } from './i18n';
import { supabaseServer } from './supabase/server';
import type { Business, Lang, Membership, Permissions } from './types';

export interface AppContext {
  userId: string;
  email: string;
  business: Business;
  membership: Membership;
  businesses: { id: string; name: string; type: Business['type']; role: Membership['role'] }[];
  perms: Permissions;
  isOwner: boolean;
  lang: Lang;
  theme: 'dark' | 'light' | 'system';
  t: Dict;
  today: string;
}

const BIZ_COLS = 'id,name,type,modules,currency,language,timezone,allow_negative_stock,report_time,report_channel,telegram_chat_id,agent_settings';

/** Loads the signed-in user, their active business and permissions (once per request). */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.from('memberships').select(`id,business_id,user_id,role,full_name,phone,permissions,active,businesses(${BIZ_COLS})`)
      .eq('user_id', user.id).eq('active', true),
    supabase.from('profiles').select('active_business_id,language,theme').eq('id', user.id).maybeSingle(),
  ]);
  const list = (rows ?? []) as unknown as (Membership & { businesses: Business })[];
  if (!list.length) redirect('/onboarding');

  const active = list.find((m) => m.business_id === profile?.active_business_id) ?? list[0];
  const store = await cookies();
  const cookieLang = store.get('lang')?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : isLang(profile?.language) ? profile!.language : active.businesses.language;
  const theme = (profile?.theme ?? 'dark') as AppContext['theme'];
  const { businesses: business, ...membership } = active;
  return {
    userId: user.id,
    email: user.email ?? '',
    business: { ...business, agent_settings: business.agent_settings ?? {} },
    membership,
    businesses: list.map((m) => ({ id: m.business_id, name: m.businesses.name, type: m.businesses.type, role: m.role })),
    perms: membership.permissions,
    isOwner: membership.role === 'owner',
    lang,
    theme,
    t: dict(lang),
    today: todayIn(business.timezone),
  };
});

/** For server actions: same context, but never redirects mid-mutation. */
export async function requireContext(): Promise<AppContext> {
  return getAppContext();
}
