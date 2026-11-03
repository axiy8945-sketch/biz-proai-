import 'server-only';
import type { AppContext } from '../context';
import { supabaseDataPort } from '../supabase/data-port';
import { supabaseServer } from '../supabase/server';
import type { AgentContext } from './types';

/** Agent context bound to the signed-in user's own Supabase session (RLS + permission checks apply). */
export async function agentContextFor(ctx: AppContext): Promise<AgentContext> {
  const sb = await supabaseServer();
  return {
    businessId: ctx.business.id,
    businessName: ctx.business.name,
    businessType: ctx.business.type,
    modules: ctx.business.modules,
    currency: ctx.business.currency,
    lang: ctx.lang,
    timezone: ctx.business.timezone,
    role: ctx.membership.role,
    perms: ctx.perms,
    disabledAgents: ctx.business.agent_settings.disabled ?? [],
    data: supabaseDataPort(sb),
    t: ctx.t,
  };
}
