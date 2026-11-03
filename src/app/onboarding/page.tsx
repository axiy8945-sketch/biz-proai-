import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/forms/OnboardingForm';
import { dict, isLang } from '@/lib/i18n';
import { supabaseServer } from '@/lib/supabase/server';

export default async function OnboardingPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const v = (await cookies()).get('lang')?.value;
  const lang = isLang(v) ? v : 'ky';
  return <OnboardingForm t={dict(lang)} lang={lang} ownerName={String(user.user_metadata?.full_name ?? '')} />;
}
