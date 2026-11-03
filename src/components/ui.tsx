import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="row between" style={{ margin: '6px 0 14px' }}>
      <h1 className="page-title" style={{ margin: 0 }}>{children}</h1>
      {action}
    </div>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="section-title"><span>{title}</span>{action}</h2>
      {children}
    </section>
  );
}

export function Stat({ icon, tone = 'blue', label, value, sub }: { icon: IconName; tone?: 'blue' | 'violet' | 'green' | 'red' | 'amber'; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat rise">
      <div className={`stat-icon ic-${tone}`}><Icon name={icon} /></div>
      <div className="label">{label}</div>
      <div className="stat-value num">{value}</div>
      {sub ? <div className="tiny faint" style={{ marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

export function Change({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`pill ${up ? 'pill-up' : 'pill-down'} num`}>
      <Icon name={up ? 'trendUp' : 'trendDown'} width={13} height={13} />
      {up ? '+' : '−'}{Math.abs(pct).toFixed(1).replace('.', ',')}%
    </span>
  );
}

export function Empty({ icon = 'sparkles', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      <div className="bold">{title}</div>
      {text ? <p className="muted small" style={{ maxWidth: 320 }}>{text}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice"><Icon name="alert" /><span>{children}</span></div>;
}

export function Row({ href, icon, avatar, title, sub, end, endSub, tone }: {
  href?: string; icon?: IconName; avatar?: string; title: ReactNode; sub?: ReactNode; end?: ReactNode; endSub?: ReactNode; tone?: string;
}) {
  const inner = (
    <>
      {icon ? <div className={`avatar ${tone ?? ''}`}><Icon name={icon} /></div> : avatar ? <div className={`avatar ${tone ?? ''}`}>{avatar}</div> : null}
      <div className="grow">
        <div className="row-title truncate">{title}</div>
        {sub ? <div className="row-sub truncate">{sub}</div> : null}
      </div>
      {end !== undefined ? (
        <div className="row-end">
          <div className="row-title num">{end}</div>
          {endSub ? <div className="row-sub">{endSub}</div> : null}
        </div>
      ) : href ? <Icon name="chevron" width={18} height={18} className="faint" /> : null}
    </>
  );
  return href ? <Link href={href} className="list-row">{inner}</Link> : <div className="list-row">{inner}</div>;
}

export function Seg({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="seg" aria-label="period">
      {items.map((i) => <Link key={i.key} href={i.href} aria-current={i.key === current ? 'true' : undefined} scroll={false}>{i.label}</Link>)}
    </nav>
  );
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';
}
