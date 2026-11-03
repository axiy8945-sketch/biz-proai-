import type { Dict } from './i18n';
import { fmt } from './i18n';

/** Maps database error codes (raised by app_require) to a friendly localized message. */
export function errorMessage(t: Dict, raw: unknown): string {
  const msg = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : (raw as { message?: string })?.message ?? '';
  if (msg.startsWith('msg:')) return msg.slice(4);
  const [code, ...rest] = msg.split(':');
  const key = code.trim() as keyof Dict['errors'];
  if (key in t.errors) return fmt(t.errors[key], { x: rest.join(':').trim() });
  if (/duplicate key|unique/i.test(msg)) return t.errors.duplicate;
  if (/row-level security|permission denied/i.test(msg)) return t.errors.forbidden;
  return t.errors.generic;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
