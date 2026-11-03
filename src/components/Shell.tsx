import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Dict } from '@/lib/i18n';
import type { NavItem } from '@/lib/nav';
import { Icon, LogoMark } from './icons';
import { BottomNav, SideNav } from './NavLinks';
import { initials } from './ui';

export interface ShellProps {
  t: Dict;
  businessName: string;
  roleLabel: string;
  primary: NavItem[];
  secondary: NavItem[];
  children: ReactNode;
}

export function Shell({ t, businessName, roleLabel, primary, secondary, children }: ShellProps) {
  const prim = primary.map((i) => ({ href: i.href, label: t.nav[i.label], icon: i.icon }));
  const sec = secondary.map((i) => ({ href: i.href, label: t.nav[i.label], icon: i.icon }));
  return (
    <div className="app">
      <aside className="sidebar" aria-label="sidebar">
        <div className="logo" style={{ padding: '4px 8px 18px' }}><LogoMark /> BizPro AI</div>
        <SideNav items={[...prim.filter((i) => i.href !== '/more'), ...sec]} />
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <Link href="/settings" className="biz-chip" aria-label={t.settings.switchBusiness}>
            <span className="biz-dot">{initials(businessName)}</span>
            <span className="truncate bold small" style={{ maxWidth: 170 }}>{businessName}</span>
          </Link>
          <span className="pill" style={{ marginLeft: 'auto' }}>{roleLabel}</span>
          <Link href="/ai" className="icon-btn" aria-label={t.nav.ai}><Icon name="sparkles" /></Link>
        </header>
        <main className="main">{children}</main>
      </div>
      <BottomNav items={prim} aiLabel={t.nav.ai} />
    </div>
  );
}
