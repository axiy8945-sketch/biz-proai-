import { SignOutButton } from '@/components/forms/SettingsForms';
import { LangSwitch } from '@/components/forms/AuthForm';
import { PageTitle, Row } from '@/components/ui';
import { getAppContext } from '@/lib/context';
import { MORE_ITEMS, visible } from '@/lib/nav';

export default async function MorePage() {
  const ctx = await getAppContext();
  const items = visible(MORE_ITEMS, ctx.business.modules, ctx.perms, ctx.isOwner);
  return (
    <div className="stack">
      <PageTitle>{ctx.t.nav.more}</PageTitle>
      <div className="card card-flush list">
        {items.map((i) => <Row key={i.href} href={i.href} icon={i.icon} tone="ic-blue" title={ctx.t.nav[i.label]} />)}
      </div>
      <div className="card row between"><span className="bold small">{ctx.t.settings.language}</span><LangSwitch lang={ctx.lang} /></div>
      <SignOutButton label={ctx.t.common.signOut} />
      <p className="tiny faint" style={{ textAlign: 'center' }}>BizPro AI · {ctx.t.brand.slogan}<br />{ctx.email}</p>
    </div>
  );
}
