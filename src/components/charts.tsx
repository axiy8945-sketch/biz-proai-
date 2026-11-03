// Lightweight SVG charts: no chart library, scale to any phone width, no horizontal scroll.
import { compact } from '@/lib/format';

export function BarChart({ data, labels, height = 150, highlightLast = true, ariaLabel }: {
  data: number[]; labels: string[]; height?: number; highlightLast?: boolean; ariaLabel: string;
}) {
  const W = 340, H = height, pad = { t: 18, b: 22, l: 4, r: 4 };
  const max = Math.max(...data, 1);
  const n = Math.max(data.length, 1);
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.min(28, slot * 0.62);
  const every = n > 14 ? Math.ceil(n / 7) : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="bp" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3d7bff" /><stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {[0.5, 1].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - f)} y2={pad.t + (H - pad.t - pad.b) * (1 - f)} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      {data.map((v, i) => {
        const h = Math.max(v > 0 ? 3 : 0, ((H - pad.t - pad.b) * v) / max);
        const x = pad.l + slot * i + (slot - bw) / 2;
        const y = H - pad.b - h;
        const last = highlightLast && i === n - 1;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={last ? 'url(#bp)' : 'var(--surface-3)'} opacity={last ? 1 : 0.95}>
              <title>{`${labels[i]}: ${v}`}</title>
            </rect>
            {last && v > 0 ? <text x={x + bw / 2} y={y - 5} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 700 }}>{compact(v)}</text> : null}
            {i % every === 0 || i === n - 1 ? <text x={x + bw / 2} y={H - 6} textAnchor="middle">{labels[i]}</text> : null}
          </g>
        );
      })}
      <rect x={pad.l} y={H - pad.b} width={W - pad.l - pad.r} height={1} fill="var(--border)" />
    </svg>
  );
}

export function Bars({ rows }: { rows: { label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={i} className="bar-row">
          <span className="small bold truncate">{r.label}{r.sub ? <span className="faint" style={{ fontWeight: 500 }}> · {r.sub}</span> : null}</span>
          <span className="small num bold">{r.display}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 60}ms` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ parts, size = 120, label, sub }: { parts: { value: number; color: string }[]; size?: number; label: string; sub?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 42, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} style={{ flex: 'none' }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
      {parts.map((p, i) => {
        const len = (p.value / total) * c;
        const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" strokeLinecap="butt" />;
        acc += len;
        return el;
      })}
      <text x="50" y={sub ? 49 : 54} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 15, fontWeight: 760 }}>{label}</text>
      {sub ? <text x="50" y="63" textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 8.5 }}>{sub}</text> : null}
    </svg>
  );
}

export const SERIES_COLORS = ['#3d7bff', '#8b5cf6', '#22d3ee', '#22c55e', '#f59e0b', '#f43f5e', '#64748b', '#a855f7', '#14b8a6'];
