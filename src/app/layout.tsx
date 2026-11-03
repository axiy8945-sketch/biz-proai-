import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'BizPro AI', template: '%s · BizPro AI' },
  description: 'Your Business. Your AI Team.',
  applicationName: 'BizPro AI',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070b18' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
  ],
};

// Resolves the "system" theme before first paint to avoid a flash.
const themeScript = `(function(){try{var d=document.documentElement;if(d.dataset.theme==='system'){d.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}}catch(e){}})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const theme = store.get('theme')?.value ?? 'dark';
  const lang = store.get('lang')?.value ?? 'ky';
  return (
    <html lang={lang} data-theme={theme} className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
