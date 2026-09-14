import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://market-intelligence.vercel.app'),
  title: { default: 'Market Intelligence — Crypto & Markets', template: '%s | Market Intelligence' },
  description: 'Fast market intelligence for crypto, global markets, macro headlines and live signals.',
  keywords: ['crypto news', 'bitcoin', 'ethereum', 'market news', 'financial markets', 'market intelligence'],
  robots: { index: true, follow: true },
  openGraph: { title: 'Market Intelligence', description: 'Crypto, markets and breaking intelligence in one dashboard.', type: 'website' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}