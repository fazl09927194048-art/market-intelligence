import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DRO OMNIBRAIN',
  description: 'فضای کاری مستقل DRO برای گفت‌وگو، تحلیل نمودار و بررسی داده‌های بازار.',
  robots: { index: false, follow: false },
};

export default function DROLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
