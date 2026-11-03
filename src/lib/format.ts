import type { Lang } from './types';

const CURRENCY_LABEL: Record<string, Record<Lang, string>> = {
  KGS: { ky: 'сом', ru: 'сом', uz: 'som' },
  UZS: { ky: 'сум', ru: 'сум', uz: 'soʻm' },
  KZT: { ky: '₸', ru: '₸', uz: '₸' },
  RUB: { ky: '₽', ru: '₽', uz: '₽' },
  USD: { ky: '$', ru: '$', uz: '$' },
};

export function currencyLabel(currency: string, lang: Lang): string {
  return CURRENCY_LABEL[currency]?.[lang] ?? currency;
}

/** Groups thousands with a narrow no-break space so numbers never wrap on phones. */
export function num(value: number | null | undefined, maxFractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  const fixed = Math.abs(n).toFixed(maxFractionDigits).replace(/\.?0+$/, '');
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '−' : '') + grouped + (frac ? ',' + frac : '');
}

export function money(value: number | null | undefined, currency: string, lang: Lang): string {
  if (value === null || value === undefined) return '—';
  const label = currencyLabel(currency, lang);
  const s = num(value, 2);
  return label.length <= 1 ? `${s} ${label}` : `${s} ${label}`;
}

/** Compact money for chart labels: 12,5k */
export function compact(value: number): string {
  const a = Math.abs(value);
  if (a >= 1_000_000) return num(value / 1_000_000, 1) + 'M';
  if (a >= 1_000) return num(value / 1_000, 1) + 'k';
  return num(value, 0);
}

const LOCALE: Record<Lang, string> = { ky: 'ky-KG', ru: 'ru-RU', uz: 'uz-Latn-UZ' };
const MONTHS: Record<Lang, string[]> = {
  ky: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
};

/** "3 ноя" from YYYY-MM-DD, independent of the server's ICU data. */
export function shortDate(iso: string, lang: Lang): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[lang][m - 1]}`;
}

export function dateTime(iso: string, lang: Lang, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return `${shortDate(`${parts.year}-${parts.month}-${parts.day}`, lang)}, ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

export function timeOnly(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : num(value, 1);
}

export { LOCALE };
