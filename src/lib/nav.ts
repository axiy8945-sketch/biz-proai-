import type { IconName } from '@/components/icons';
import type { Dict } from './i18n';
import type { ModuleId, Permissions } from './types';

export interface NavItem { href: string; label: keyof Dict['nav']; icon: IconName; module?: ModuleId; perm?: keyof Permissions; ownerOnly?: boolean }

/** Secondary destinations (shown under "More" on phones and in the desktop sidebar). */
export const MORE_ITEMS: NavItem[] = [
  { href: '/expenses', label: 'expenses', icon: 'wallet', module: 'expenses' },
  { href: '/inventory/purchase', label: 'purchases', icon: 'truck', module: 'purchases', perm: 'manage_inventory' },
  { href: '/production', label: 'production', icon: 'flame', module: 'production' },
  { href: '/recipes', label: 'recipes', icon: 'book', module: 'recipes' },
  { href: '/reports', label: 'reports', icon: 'chart', module: 'reports' },
  { href: '/employees', label: 'employees', icon: 'users', module: 'employees', ownerOnly: true },
  { href: '/ai/team', label: 'team', icon: 'brain' },
  { href: '/activity', label: 'activity', icon: 'list', ownerOnly: true },
  { href: '/settings', label: 'settings', icon: 'settings' },
];

export const PRIMARY_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'home', icon: 'home' },
  { href: '/sales', label: 'sales', icon: 'cart', module: 'sales' },
  { href: '/ai', label: 'ai', icon: 'sparkles' },
  { href: '/inventory', label: 'stock', icon: 'box', module: 'inventory' },
  { href: '/more', label: 'more', icon: 'menu' },
];

export function visible(items: NavItem[], modules: ModuleId[], perms: Permissions, isOwner: boolean): NavItem[] {
  return items.filter((i) => (!i.module || modules.includes(i.module)) && (!i.perm || perms[i.perm]) && (!i.ownerOnly || isOwner)
    && !(i.href === '/production' && !perms.record_production && !perms.view_finance));
}
