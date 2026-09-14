import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://market-intelligence-840b.onrender.com'),
  title: { default: 'Market Intelligence — Crypto & Markets', template: '%s | Market Intelligence' },
  description: 'Fast market intelligence for crypto, global markets, macro headlines and live signals.',
  keywords: ['crypto news','bitcoin','ethereum','market news','financial markets','market intelligence','forex','gold','oil'],
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: { title: 'Market Intelligence', description: 'Crypto, markets and breaking intelligence in one dashboard.', type: 'website', url: 'https://market-intelligence-840b.onrender.com' },
};

export const viewport: Viewport = { themeColor: '#06080c', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
