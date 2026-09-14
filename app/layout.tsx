import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Market Intelligence — Crypto & Markets',
  description: 'Live market intelligence, crypto news, macro headlines and market signals.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}