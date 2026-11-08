export default function DROLoading() {
  return (
    <main aria-label="Loading DRO workspace" style={{ minHeight: '100dvh', background: '#212121', color: '#ececec', display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)', fontFamily: 'system-ui,sans-serif' }}>
      <aside style={{ background: '#171717', borderRight: '1px solid #303030', padding: 18 }}>
        <div style={{ color: '#9bf0b4', fontWeight: 800 }}>✳ DRO OMNIBRAIN</div>
        <div style={{ marginTop: 24, color: '#888', fontSize: 13 }}>در حال آماده‌سازی فضای کاری…</div>
      </aside>
      <section style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ width: 'min(560px,100%)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: '#9bf0b4' }}>✳</div>
          <h1 style={{ fontSize: 26 }}>در حال آماده‌سازی DRO</h1>
          <p style={{ color: '#aaa', lineHeight: 1.8 }}>فضای گفت‌وگو و ابزارها در حال بارگذاری هستند. لطفاً چند لحظه صبر کن.</p>
          <div role="status" aria-live="polite" style={{ color: '#9bf0b4', fontSize: 13 }}>در حال اتصال…</div>
        </div>
      </section>
    </main>
  );
}
