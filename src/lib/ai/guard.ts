// "Never invent data" guard. Every number the LLM writes must exist in the
// agents' reports (raw values, their rounded forms, or numbers already present
// in the deterministic text). Otherwise the coordinator falls back to the
// deterministic answer.
import type { AgentReport } from './types';

function collectNumbers(value: unknown, out: Set<string>) {
  if (value === null || value === undefined) return;
  if (typeof value === 'number') { addNumber(value, out); return; }
  if (typeof value === 'string') { for (const n of extractNumbers(value)) addNumber(n, out); return; }
  if (Array.isArray(value)) { value.forEach((v) => collectNumbers(v, out)); return; }
  if (typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out));
}

function addNumber(n: number, out: Set<string>) {
  if (!Number.isFinite(n)) return;
  const a = Math.abs(n);
  out.add(String(a));
  out.add(a.toFixed(0));
  out.add(a.toFixed(1).replace(/\.0$/, ''));
  out.add(a.toFixed(2).replace(/\.?0+$/, ''));
  out.add(String(Math.round(a)));
  out.add(String(Math.floor(a)));
  // thousands shorthand the model might use ("12,5 тыс.", "1.2 млн")
  if (a >= 1000) out.add((a / 1000).toFixed(1).replace(/\.0$/, ''));
  if (a >= 1_000_000) out.add((a / 1_000_000).toFixed(1).replace(/\.0$/, ''));
}

/** Parses "12 345,50", "12 345.5", "12,345", "−3,2" (any thin/no-break spaces). */
export function extractNumbers(text: string): number[] {
  const cleaned = text.replace(/[   ]/g, ' ');
  const re = /\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;
  const out: number[] = [];
  for (const m of cleaned.match(re) ?? []) {
    let s = m;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');      // 12,345.5
    else s = s.replace(/ /g, '').replace(',', '.');                        // 12 345,5
    const n = Number(s);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function allowedNumbers(reports: AgentReport[], question: string): Set<string> {
  const out = new Set<string>();
  for (const r of reports) {
    collectNumbers(r.data, out);
    collectNumbers(r.text, out);
    collectNumbers(r.facts.map((f) => f.value), out);
    collectNumbers(r.warnings, out);
    collectNumbers(r.insights ?? [], out);
    collectNumbers(r.recommendations ?? [], out);
    collectNumbers([r.task.period.from, r.task.period.to], out);
  }
  collectNumbers(question, out);
  for (let i = 0; i <= 10; i++) out.add(String(i)); // list numbering, "1 товар"
  out.add('100'); out.add('24'); out.add('7'); out.add('30');
  return out;
}

export function findUnsupportedNumbers(answer: string, allowed: Set<string>): number[] {
  return extractNumbers(answer).filter((n) => {
    const a = Math.abs(n);
    const variants = [String(a), a.toFixed(0), a.toFixed(1).replace(/\.0$/, ''), a.toFixed(2).replace(/\.?0+$/, '')];
    return !variants.some((v) => allowed.has(v));
  });
}
