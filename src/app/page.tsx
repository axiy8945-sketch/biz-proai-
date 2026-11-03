import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export default async function Home() {
  let signedIn = false;
  try {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    signedIn = Boolean(data.user);
  } catch (e) {
    console.error('home_auth_check_failed', e instanceof Error ? e.message : e);
  }
  redirect(signedIn ? '/dashboard' : '/login');
}
