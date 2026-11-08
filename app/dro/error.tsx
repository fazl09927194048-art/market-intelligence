'use client';

export default function DROError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main dir="rtl" style={{ minHeight: '100dvh', background: '#212121', color: '#ececec', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui,sans-serif' }}>
      <section style={{ width: 'min(520px,100%)', background: '#171717', border: '1px solid #3b3b3b', borderRadius: 18, padding: 24 }}>
        <div style={{ color: '#9bf0b4', fontSize: 24 }}>✳ DRO OMNIBRAIN</div>
        <h1 style={{ fontSize: 22 }}>فضای کاری به مشکل برخورد کرد</h1>
        <p style={{ color: '#aaa', lineHeight: 1.9 }}>این خطا به معنی از بین رفتن تاریخچهٔ محلی نیست. می‌توانی صفحه را دوباره بارگذاری کنی یا به داشبورد برگردی.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => reset()} style={{ border: 0, borderRadius: 10, padding: '10px 14px', background: '#b9f6ca', color: '#102017', cursor: 'pointer' }}>تلاش دوباره</button>
          <a href="/" style={{ border: '1px solid #444', borderRadius: 10, padding: '10px 14px', color: '#eee', textDecoration: 'none' }}>بازگشت به داشبورد</a>
        </div>
      </section>
    </main>
  );
}
