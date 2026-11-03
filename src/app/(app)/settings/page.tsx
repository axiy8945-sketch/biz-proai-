import Link from 'next/link';
import { LangSwitch } from '@/components/forms/AuthForm';
import { BusinessSettingsForm, BusinessSwitcher, ReportSettingsForm, SignOutButton, TelegramConnect, ThemePicker } from '@/components/forms/SettingsForms';
import { Icon } from '@/components/icons';
import { PageTitle, Section } from '@/components/ui';
import { getAppContext } from '@/lib/context';
import { telegramConfigured } from '@/lib/telegram';

export default async function SettingsPage() {
  const ctx = await getAppContext();
  const { t, business } = ctx;
  return (
    <div className="stack">
      <PageTitle>{t.settings.title}</PageTitle>
      <Section title={t.settings.appearance}>
        <div className="card stack">
          <div className="row between wrap"><span className="bold small">{t.settings.language}</span><LangSwitch lang={ctx.lang} /></div>
          <div className="row between wrap"><span className="bold small">{t.settings.theme}</span><ThemePicker t={t} theme={ctx.theme} /></div>
        </div>
      </Section>
      {ctx.businesses.length > 0 && (
        <Section title={t.settings.switchBusiness} action={<Link href="/onboarding"><Icon name="plus" width={14} style={{ display: 'inline' }} /> {t.settings.addBusiness}</Link>}>
          <BusinessSwitcher t={t} current={business.id} list={ctx.businesses} />
        </Section>
      )}
      {ctx.isOwner && (
        <>
          <Section title={t.settings.business}><BusinessSettingsForm t={t} business={business} /></Section>
          <Section title={t.settings.reports}><ReportSettingsForm t={t} business={business} /></Section>
          <Section title={t.settings.telegram}>
            <TelegramConnect t={t} connected={Boolean(business.telegram_chat_id)} configured={telegramConfigured()} botName={process.env.TELEGRAM_BOT_USERNAME ?? ''} />
          </Section>
        </>
      )}
      <SignOutButton label={t.common.signOut} />
    </div>
  );
}
