import type { Lang } from '../types';
import { ky } from './ky';
import { ru, type Dict } from './ru';
import { uz } from './uz';

const dicts: Record<Lang, Dict> = { ky, uz, ru };

export type { Dict };
export function dict(lang: Lang): Dict {
  return dicts[lang] ?? dicts.ky;
}

/** Replace {name} placeholders. Unknown placeholders are left visible on purpose. */
export function fmt(template: string, vars: Record<string, string | number | null | undefined> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

export function isLang(v: unknown): v is Lang {
  return v === 'ky' || v === 'uz' || v === 'ru';
}
