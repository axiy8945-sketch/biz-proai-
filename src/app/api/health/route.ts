import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Setup diagnostics: reports what is configured and which step fails. Never returns secret values. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const kind = (k: string) => (!k ? 'missing' : k.startsWith('eyJ') ? 'legacy-jwt' : k.startsWith('sb_publishable_') ? 'publishable' : k.startsWith('sb_secret_') ? 'secret' : 'unknown-format');
  const out: Record<string, unknown> = {
    env: {
      url: !url ? 'missing' : /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) ? 'ok' : 'bad-format (must be https://xxxx.supabase.co)',
      anon_key: kind(anon),
      service_key: kind(service),
    },
  };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = { error: e instanceof Error ? e.message : String(e) }; }
  };
  await step('database_schema', async () => {
    const admin = supabaseAdmin();
    if (!admin) return 'skipped (no service key)';
    const { error, count } = await admin.from('businesses').select('id', { count: 'exact', head: true });
    return error ? { error: error.message } : { ok: true, businesses: count };
  });
  await step('session', async () => {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.getUser();
    if (error && !data.user) return { signed_in: false, note: error.message };
    if (!data.user) return { signed_in: false };
    const m = await sb.from('memberships').select('business_id,role,businesses(id,name,type)').eq('user_id', data.user.id);
    const p = await sb.from('profiles').select('active_business_id').eq('id', data.user.id).maybeSingle();
    const res: Record<string, unknown> = { signed_in: true, memberships: m.error ? { error: m.error.message } : m.data?.length ?? 0, profile: p.error ? { error: p.error.message } : Boolean(p.data) };
    const ctxq = await sb.from('memberships').select('id,business_id,user_id,role,full_name,phone,permissions,active,businesses(id,name,type,modules,currency,language,timezone,allow_negative_stock,report_time,report_channel,telegram_chat_id,agent_settings)').eq('user_id', data.user.id).eq('active', true);
    res.context_query = ctxq.error ? { error: ctxq.error.message } : 'ok';
    const prof = await sb.from('profiles').select('active_business_id,language,theme').eq('id', data.user.id).maybeSingle();
    res.profile_query = prof.error ? { error: prof.error.message } : 'ok';
    const biz = m.data?.[0]?.business_id;
    if (biz) {
      const d = new Date().toISOString().slice(0, 10);
      const calls: [string, Record<string, unknown>][] = [
        ['fn_sales_overview', { p_business: biz, p_from: d, p_to: d }],
        ['fn_finance_summary', { p_business: biz, p_from: d, p_to: d }],
        ['fn_sales_series', { p_business: biz, p_from: d, p_to: d }],
        ['fn_top_products', { p_business: biz, p_from: d, p_to: d, p_limit: 5 }],
        ['fn_inventory_status', { p_business: biz }],
        ['list_products', { p_business: biz, p_include_inactive: true }],
        ['app_today', { p_business: biz }],
      ];
      const rpc: Record<string, unknown> = {};
      for (const [fn, args] of calls) {
        const r = await sb.rpc(fn, args);
        rpc[fn] = r.error ? { error: r.error.message, code: r.error.code } : 'ok';
      }
      res.rpc = rpc;
    }
    return res;
  });
  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
