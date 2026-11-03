'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AgentId, Fact, ReportStatus } from '@/lib/ai/types';
import type { Dict } from '@/lib/i18n';
import { Icon } from '../icons';
import { AGENT_ICON } from './agentIcons';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: 'llm' | 'rules';
  reports?: { agent: AgentId; status: ReportStatus; intent: string; facts: Fact[] }[];
}


export function Chat({ t, conversationId, initial, team, llm }: {
  t: Dict; conversationId: string | null; initial: ChatMessage[]; team: { id: AgentId; on: boolean }[]; llm: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [conv, setConv] = useState(conversationId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null); setBusy(true); setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: q }]);
    try {
      const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q, conversationId: conv }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t.errors.generic);
      setConv(json.conversationId);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: json.answer, reports: json.reports, mode: json.mode }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.generic);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  return (
    <div className="chat">
      <div className="row between" style={{ marginTop: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}><span className="grad-text">{t.ai.title}</span></h1>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/ai/team" className="icon-btn" aria-label={t.nav.team}><Icon name="brain" /></Link>
          <Link href="/ai?new=1" className="icon-btn" aria-label={t.ai.newChat} onClick={() => { setMessages([]); setConv(null); }}><Icon name="plus" /></Link>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="stack rise">
          <div className="card card-hero">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              {team.map((a) => (
                <span key={a.id} className={`stat-icon ${AGENT_ICON[a.id].tone}`} style={{ margin: 0, opacity: a.on ? 1 : 0.35 }} title={t.agent[a.id]}>
                  <Icon name={AGENT_ICON[a.id].icon} />
                </span>
              ))}
            </div>
            <p className="small" style={{ lineHeight: 1.5 }}>{t.ai.intro}</p>
            {!llm && <p className="tiny faint" style={{ marginTop: 8 }}>{t.ai.ruleMode}</p>}
          </div>
          <div className="stack-sm">
            {t.ai.suggestions.map((s) => (
              <button key={s} type="button" className="list-row card" style={{ minHeight: 52, padding: '12px 14px', borderRadius: 14 }} onClick={() => ask(s)}>
                <Icon name="sparkles" width={16} className="faint" /><span className="grow small bold" style={{ textAlign: 'left' }}>{s}</span><Icon name="chevron" width={16} className="faint" />
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m) => m.role === 'user' ? (
        <div key={m.id} className="msg msg-user">{m.content}</div>
      ) : (
        <div key={m.id} className="msg msg-ai">
          {m.reports && m.reports.length > 0 && (
            <div className="agent-chips" aria-label={t.ai.consulted}>
              <span className="agent-chip"><i className={AGENT_ICON.coordinator.tone}><Icon name="sparkles" /></i>{t.agent.coordinator}</span>
              {Array.from(new Map(m.reports.map((r) => [r.agent, r])).values()).map((r) => (
                <span key={r.agent} className="agent-chip" data-status={r.status}><i className={AGENT_ICON[r.agent].tone}><Icon name={AGENT_ICON[r.agent].icon} /></i>{t.agent[r.agent]}</span>
              ))}
            </div>
          )}
          <div className="bubble">{m.content}</div>
          {m.reports && m.reports.flatMap((r) => r.facts).length > 0 && (
            <div className="facts">
              {m.reports.flatMap((r) => r.facts).slice(0, 6).map((f, i) => (
                <div key={i} className="fact"><span className="tiny faint truncate" style={{ display: 'block' }}>{f.label}</span>
                  <b className={`num ${f.tone === 'up' ? 'up' : f.tone === 'down' ? 'down' : f.tone === 'warn' ? 'warn' : ''}`}>{f.value}</b></div>
              ))}
            </div>
          )}
        </div>
      ))}
      {busy && <div className="msg"><div className="typing" aria-label={t.ai.thinking}><span /><span /><span /></div><div className="tiny faint" style={{ marginTop: 6 }}>{t.ai.thinking}</div></div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div ref={endRef} />

      <div className="chat-input">
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <textarea ref={taRef} className="textarea" rows={1} value={input} maxLength={1000} placeholder={t.ai.placeholder} aria-label={t.ai.placeholder}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }} enterKeyHint="send" />
          <button className="btn btn-primary" style={{ width: 48, padding: 0, flex: 'none' }} disabled={busy || !input.trim()} aria-label="send"><Icon name="send" /></button>
        </form>
      </div>
    </div>
  );
}
