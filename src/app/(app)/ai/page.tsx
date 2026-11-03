import { Chat, type ChatMessage } from '@/components/ai/Chat';
import { getAppContext } from '@/lib/context';
import { supabaseServer } from '@/lib/supabase/server';
import { AGENT_IDS } from '@/lib/ai/types';
import { agentAvailable } from '@/lib/ai/coordinator';
import { agentContextFor } from '@/lib/ai/context';

export const dynamic = 'force-dynamic';

export default async function AiPage({ searchParams }: { searchParams: Promise<{ c?: string; new?: string }> }) {
  const ctx = await getAppContext();
  const sp = await searchParams;
  const sb = await supabaseServer();
  let conversationId: string | null = null;
  let messages: ChatMessage[] = [];
  if (sp.new !== '1') {
    const conv = sp.c
      ? await sb.from('ai_conversations').select('id').eq('id', sp.c).maybeSingle()
      : await sb.from('ai_conversations').select('id').eq('business_id', ctx.business.id).eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (conv.data) {
      conversationId = conv.data.id;
      const { data } = await sb.from('ai_messages').select('id,role,content,data').eq('conversation_id', conversationId).order('created_at').limit(60);
      messages = (data ?? []).map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, reports: (m.data as { reports?: ChatMessage['reports'] })?.reports, mode: (m.data as { mode?: 'llm' | 'rules' })?.mode }));
    }
  }
  const actx = await agentContextFor(ctx);
  const team = AGENT_IDS.map((id) => ({ id, on: agentAvailable(actx, id) }));
  return <Chat t={ctx.t} conversationId={conversationId} initial={messages} team={team} llm={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
