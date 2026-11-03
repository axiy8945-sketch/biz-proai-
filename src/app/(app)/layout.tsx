import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { getAppContext } from '@/lib/context';
import { MORE_ITEMS, PRIMARY_ITEMS, visible } from '@/lib/nav';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAppContext();
  const { business, perms, isOwner, t } = ctx;
  return (
    <Shell
      t={t}
      businessName={business.name}
      roleLabel={isOwner ? t.emp.owner : t.emp.employee}
      primary={visible(PRIMARY_ITEMS, business.modules, perms, isOwner)}
      secondary={visible(MORE_ITEMS, business.modules, perms, isOwner)}
    >
      {children}
    </Shell>
  );
}
