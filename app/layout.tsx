import type { Metadata, Viewport } from 'next';
import './globals.css';
import DROBehavior from './components/DROBehavior';

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
  return <html lang="en" dir="ltr"><body><DROBehavior />{children}<div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:9998,display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'9px 14px',background:'rgba(6,8,12,.94)',backdropFilter:'blur(12px)',borderTop:'1px solid rgba(255,255,255,.1)',fontSize:13}}><span style={{color:'#b9c0cc'}}>xXx DRO Android</span><a href="https://github.com/fazl09927194048-art/market-intelligence/releases/latest/download/app-debug.apk" style={{color:'#fff',background:'#16a34a',padding:'7px 14px',borderRadius:999,textDecoration:'none',fontWeight:700}}>دانلود نسخه اپلیکیشن</a><a href="/extension" style={{color:'#b9c0cc',textDecoration:'none'}}>افزونه</a></div></body></html>;
}
