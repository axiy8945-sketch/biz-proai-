// Period maths in the business timezone. Returns inclusive local dates (YYYY-MM-DD)
// which the SQL functions convert to timestamps with the same timezone.

export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';
export interface Period { key: PeriodKey; from: string; to: string }

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parse(d: string): Date { return new Date(d + 'T00:00:00Z'); }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
export function addDays(d: string, n: number): string { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); }
export function daysBetween(a: string, b: string): number { return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000); }

export function periodFor(key: PeriodKey, timeZone: string, now: Date = new Date()): Period {
  const t = todayIn(timeZone, now);
  const d = parse(t);
  switch (key) {
    case 'today': return { key, from: t, to: t };
    case 'yesterday': { const y = addDays(t, -1); return { key, from: y, to: y }; }
    case 'this_week': { const dow = (d.getUTCDay() + 6) % 7; return { key, from: addDays(t, -dow), to: t }; }
    case 'last_7_days': return { key, from: addDays(t, -6), to: t };
    case 'last_30_days': return { key, from: addDays(t, -29), to: t };
    case 'this_month': return { key, from: t.slice(0, 8) + '01', to: t };
    case 'last_month': {
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      return { key, from: iso(first), to: iso(last) };
    }
    default: return { key: 'today', from: t, to: t };
  }
}

/** The equally long period immediately before `p` (for "vs previous" comparisons). */
export function previousPeriod(p: Period): Period {
  if (p.key === 'this_month') {
    // compare month-to-date with the same number of days of the previous month
    const d = parse(p.from);
    const prevFrom = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    const len = daysBetween(p.from, p.to);
    const prevMonthEnd = addDays(p.from, -1);
    const to = addDays(prevFrom, len) > prevMonthEnd ? prevMonthEnd : addDays(prevFrom, len);
    return { key: 'custom', from: prevFrom, to };
  }
  const len = daysBetween(p.from, p.to) + 1;
  return { key: 'custom', from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime());
}
