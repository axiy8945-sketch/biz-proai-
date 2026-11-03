// Server-only Anthropic client. The API key never reaches the browser.
import 'server-only';

import type { LlmClient } from './llm-types';
export type { LlmClient, LlmMessage } from './llm-types';

export function getLlm(): LlmClient | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  return {
    async complete({ system, messages, tools, forceTool, maxTokens }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system, messages, temperature: 0,
            ...(tools ? { tools } : {}),
            ...(forceTool ? { tool_choice: { type: 'tool', name: forceTool } } : {}),
          }),
        });
        if (!res.ok) throw new Error(`llm_http_${res.status}`);
        const json = (await res.json()) as { content: { type: string; text?: string; input?: unknown }[] };
        const text = json.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
        const tool = json.content.find((c) => c.type === 'tool_use');
        return { text, toolInput: tool?.input };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
