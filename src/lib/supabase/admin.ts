import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. SERVER ONLY — used for creating employee auth accounts,
 * the daily-report cron and the Telegram webhook. Never import from client code.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
