import { NextResponse, type NextRequest } from 'next/server';
import { agentContextFor } from '@/lib/ai/context';
import { coordinate } from '@/lib/ai/coordinator';
import { getLlm, type LlmMessage } from '@/lib/ai/llm';
import { getAppContext } from '@/lib/context';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST { message, conversationId? } → coordinator answer, persisted to the user's private history. */
export async function POST(req: NextRequest) {
  const ctx = await getAppContext();
  const sb = await supabaseServer();
  let body: { message?: unknown; conversationId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: ctx.t.errors.generic }, { status: 400 }); }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
  if (!message) return NextResponse.json({ error: ctx.t.common.required }, { status: 400 });

  // simple rate limit: 12 questions per minute per user
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await sb.from('ai_messages').select('id', { count: 'exact', head: true }).eq('user_id', ctx.userId).eq('role', 'user').gte('created_at', since);
  if ((count ?? 0) >= 12) return NextResponse.json({ error: ctx.t.errors.rate_limited }, { status: 429 });

  let conversationId = typeof body.conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
  let history: LlmMessage[] = [];
  if (conversationId) {
    const { data } = await sb.from('ai_messages').select('role,content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(6);
    if (!data) conversationId = null; else history = data.reverse().map((m) => ({ role: m.role as LlmMessage['role'], content: m.content }));
  }
  if (!conversationId) {
    const { data, error } = await sb.from('ai_conversations').insert({ business_id: ctx.business.id, user_id: ctx.userId, title: message.slice(0, 80) }).select('id').single();
    if (error) return NextResponse.json({ error: ctx.t.errors.generic }, { status: 500 });
    conversationId = data.id;
  }

  const actx = await agentContextFor(ctx);
  const result = await coordinate(actx, message, { llm: getLlm(), history });

  const summary = result.reports.map((r) => ({ agent: r.agent, status: r.status, intent: r.task.intent, period: r.task.period, facts: r.facts }));
  await sb.from('ai_messages').insert([
    { business_id: ctx.business.id, conversation_id: conversationId, user_id: ctx.userId, role: 'user', content: message },
    { business_id: ctx.business.id, conversation_id: conversationId, user_id: ctx.userId, role: 'assistant', content: result.answer.slice(0, 8000),
      agents: result.reports.map((r) => r.agent), data: { mode: result.mode, reports: summary, warnings: result.warnings } },
  ]);

  return NextResponse.json({ conversationId, answer: result.answer, mode: result.mode, lang: result.lang, reports: summary, warnings: result.warnings });
}
