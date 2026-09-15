import Link from 'next/link';

export default function ExtensionPage() {
  const tools = ['SIG signal', 'CHT live chart', 'MTF multi-timeframe', 'BOOK order flow', 'DER funding / OI', 'NEWS intelligence', 'RISK engine', 'AI Coach', 'SCAN deep scan'];
  return (
    <main style={{minHeight:'100vh',background:'#06080c',color:'#eef5f1',padding:'48px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:920,margin:'0 auto'}}>
        <div style={{color:'#7ff2a5',fontWeight:900,letterSpacing:2}}>DRO v1.0.0</div>
        <h1 style={{fontSize:'clamp(38px,7vw,72px)',margin:'12px 0'}}>AI Market Intelligence Extension</h1>
        <p style={{color:'#aab7b0',fontSize:18,lineHeight:1.7}}>A production browser companion for Binance, KuCoin and TradingView-style market pages. DRO reads visible chart context, keeps a live exchange stream, and connects it to the market-intelligence core.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,margin:'26px 0'}}>{tools.map(x=><div key={x} style={{padding:14,border:'1px solid #26352d',borderRadius:12,background:'#0b100e',color:'#c6d0ca'}}>{x}</div>)}</div>
        <h2>What is included</h2>
        <ul style={{lineHeight:1.9,color:'#c6d0ca'}}>
          <li>Floating Shadow-DOM DRO control isolated from host-page CSS.</li>
          <li>Mouse/touch dragging with persisted position and viewport clamping.</li>
          <li>Live Binance ticker, trade and depth stream with reconnect/backoff and stale detection.</li>
          <li>Page-price/chart context forwarded to the intelligence core.</li>
          <li>Cached and stale-safe Deep Scan requests to reduce duplicate network load.</li>
          <li>Signal, chart, MTF, order flow, derivatives, news, risk and AI tools.</li>
          <li>Chrome/Edge Manifest V3 package generated automatically by GitHub Actions.</li>
        </ul>
        <section style={{marginTop:32,padding:22,border:'1px solid #26352d',borderRadius:16,background:'#0b100e'}}>
          <h2 style={{marginTop:0}}>Download DRO v1.0.0</h2>
          <p style={{color:'#aab7b0',lineHeight:1.7}}>The repository packages the complete <code>extension</code> directory into a ZIP after each main-branch update.</p>
          <a href="https://github.com/fazl09927194048-art/market-intelligence/actions" style={{display:'inline-block',padding:'12px 18px',borderRadius:10,background:'#7ff2a5',color:'#061008',fontWeight:900,textDecoration:'none'}}>Open latest DRO build →</a>
        </section>
        <h2>Install / update</h2>
        <ol style={{lineHeight:2,color:'#c6d0ca'}}><li>Download the <b>dro-extension</b> artifact from the latest package workflow.</li><li>Extract the ZIP.</li><li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>.</li><li>Enable Developer mode and choose <b>Load unpacked</b>.</li><li>Select the extracted <code>extension</code> folder.</li><li>After an update, press <b>Reload</b> for the extension and reload the market page.</li></ol>
        <p style={{color:'#7ff2a5',fontWeight:700}}>The extension is separate from the web deployment: updating the website does not automatically hot-update an already-loaded unpacked browser extension.</p>
        <Link href="/" style={{color:'#7ff2a5'}}>← Back to Market Intelligence</Link>
      </div>
    </main>
  );
}
