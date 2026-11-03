import { cookies } from 'next/headers';
import { AuthForm } from '@/components/forms/AuthForm';
import { dict, isLang } from '@/lib/i18n';

export default async function RegisterPage() {
  const v = (await cookies()).get('lang')?.value;
  const lang = isLang(v) ? v : 'ky';
  return <AuthForm mode="register" t={dict(lang)} lang={lang} />;
}
