'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

type Item = { href: string; label: string; icon: IconName };

function isActive(path: string, href: string) {
  if (href === '/ai') return path === '/ai';
  return path === href || path.startsWith(href + '/');
}

export function BottomNav({ items, aiLabel }: { items: Item[]; aiLabel: string }) {
  const path = usePathname() ?? '';
  return (
    <nav className="bottom-nav" aria-label="main">
      {items.map((i) => i.href === '/ai' ? (
        <Link key={i.href} href={i.href} className="nav-item" aria-current={isActive(path, i.href) ? 'page' : undefined} aria-label={aiLabel}>
          <span className="nav-ai"><Icon name="sparkles" /></span>
        </Link>
      ) : (
        <Link key={i.href} href={i.href} className="nav-item" aria-current={isActive(path, i.href) ? 'page' : undefined}>
          <Icon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function SideNav({ items }: { items: Item[] }) {
  const path = usePathname() ?? '';
  return (
    <>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="side-link" aria-current={isActive(path, i.href) ? 'page' : undefined}>
          <Icon name={i.icon} /> {i.label}
        </Link>
      ))}
    </>
  );
}
