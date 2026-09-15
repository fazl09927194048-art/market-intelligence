import Link from 'next/link';

export default function ExtensionPage() {
  const tools = ['SIG signal', 'CHT live chart', 'MTF multi-timeframe', 'BOOK order book', 'DER funding / OI', 'NEWS intelligence', 'RISK engine', 'AI Coach', 'SCAN deep scan'];
  return (
    <main style={{minHeight:'100vh',background:'#06080c',color:'#eef5f1',padding:'48px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:920,margin:'0 auto'}}>
        <div style={{color:'#7ff2a5',fontWeight:900,letterSpacing:2}}>DRO v0.9.0</div>
        <h1 style={{fontSize:'clamp(38px,7vw,72px)',margin:'12px 0'}}>AI Market Intelligence Extension</h1>
        <p style={{color:'#aab7b0',fontSize:18,lineHeight:1.7}}>DRO is now a real floating browser tool: draggable by mouse or touch, position-persistent across web navigation, and compact enough to stay out of the way. Double-tap the DRO button to open its tool palette.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,margin:'26px 0'}}>
          {tools.map(x=><div key={x} style={{padding:14,border:'1px solid #26352d',borderRadius:12,background:'#0b100e',color:'#c6d0ca'}}>{x}</div>)}
        </div>
        <h2>What changed</h2>
        <ul style={{lineHeight:1.9,color:'#c6d0ca'}}>
          <li>No activation screen is required for the floating tool.</li>
          <li>Drag DRO with your finger or mouse and its position is saved.</li>
          <li>Double-tap/click DRO to open the compact tools.</li>
          <li>Live extension context is bridged into the site's AI chat.</li>
          <li>Signal, chart, MTF, order book, derivatives, news, risk and deep scan use the intelligence core.</li>
          <li>The overlay is injected on normal web pages and restored after navigation; browser-restricted pages such as chrome:// cannot host content scripts.</li>
        </ul>
        <h2>Install / update</h2>
        <ol style={{lineHeight:2,color:'#c6d0ca'}}>
          <li>Download the latest DRO extension build from the repository Actions artifact.</li>
          <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>.</li>
          <li>Enable Developer mode.</li>
          <li>Remove the old DRO unpacked copy if necessary, then choose <b>Load unpacked</b> and select the updated <code>extension</code> folder.</li>
          <li>Reload the current website once after updating the extension.</li>
        </ol>
        <p><a href="https://github.com/fazl09927194048-art/market-intelligence/actions" style={{color:'#7ff2a5'}}>Open latest DRO build artifacts on GitHub →</a></p>
        <Link href="/" style={{color:'#7ff2a5'}}>← Back to Market Intelligence</Link>
      </div>
    </main>
  );
}
