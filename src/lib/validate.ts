// Small, dependency-free validators for server actions. All input is untrusted.
export class InvalidInput extends Error {}

export function str(v: FormDataEntryValue | unknown, { min = 0, max = 200, optional = false } = {}): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s && optional) return '';
  if (s.length < Math.max(min, optional ? 0 : 1) || s.length > max) throw new InvalidInput('invalid_text');
  return s;
}

export function numVal(v: FormDataEntryValue | unknown, { min = 0, max = 1e12, optional = false, int = false } = {}): number {
  const raw = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/[\s  ]/g, '').replace(',', '.') : '';
  if (!raw && optional) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw new InvalidInput('invalid_amount');
  return Math.round(n * 1000) / 1000;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback?: T): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  if (fallback !== undefined) return fallback;
  throw new InvalidInput('invalid_choice');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new InvalidInput('invalid_id');
  return v;
}

export function bool(v: unknown): boolean {
  return v === true || v === 'on' || v === 'true' || v === '1';
}

export function email(v: unknown): string {
  const s = str(v, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new InvalidInput('invalid_email');
  return s;
}
