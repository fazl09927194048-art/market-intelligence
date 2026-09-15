import Link from 'next/link';

export default function ExtensionPage() {
  const tools = ['SIG signal', 'CHT live chart', 'MTF multi-timeframe', 'BOOK order book', 'DER funding / OI', 'NEWS intelligence', 'RISK engine', 'AI Coach', 'SCAN deep scan'];
  return (
    <main style={{minHeight:'100vh',background:'#06080c',color:'#eef5f1',padding:'48px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:920,margin:'0 auto'}}>
        <div style={{color:'#7ff2a5',fontWeight:900,letterSpacing:2}}>DRO v0.9.1</div>
        <h1 style={{fontSize:'clamp(38px,7vw,72px)',margin:'12px 0'}}>AI Market Intelligence Extension</h1>
        <p style={{color:'#aab7b0',fontSize:18,lineHeight:1.7}}>DRO is a real floating browser tool: draggable by mouse or touch, position-persistent across web navigation, and compact enough to stay out of the way. Double-tap or double-click the DRO button to open its tool palette.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,margin:'26px 0'}}>
          {tools.map(x=><div key={x} style={{padding:14,border:'1px solid #26352d',borderRadius:12,background:'#0b100e',color:'#c6d0ca'}}>{x}</div>)}
        </div>
        <h2>v0.9.1</h2>
        <ul style={{lineHeight:1.9,color:'#c6d0ca'}}>
          <li>Floating DRO UI is isolated with Shadow DOM so normal websites cannot override its styles.</li>
          <li>DRO stays visible on normal web pages without an activation screen.</li>
          <li>Drag DRO with your finger or mouse; its position is saved.</li>
          <li>Double-tap/click DRO to open the compact tool palette.</li>
          <li>Live extension context is bridged into the site's AI chat.</li>
          <li>Signal, chart, MTF, order book, derivatives, news, risk and deep scan use the intelligence core.</li>
          <li>Browser-restricted pages such as chrome:// cannot host content scripts.</li>
        </ul>
        <section style={{marginTop:32,padding:22,border:'1px solid #26352d',borderRadius:16,background:'#0b100e'}}>
          <h2 style={{marginTop:0}}>Download DRO v0.9.1</h2>
          <p style={{color:'#aab7b0',lineHeight:1.7}}>The download is generated automatically from the latest main branch. Download the ZIP, extract it, then load the extracted <code>extension</code> folder in Chrome or Edge.</p>
          <a href="https://github.com/fazl09927194048-art/market-intelligence/actions" style={{display:'inline-block',padding:'12px 18px',borderRadius:10,background:'#7ff2a5',color:'#061008',fontWeight:900,textDecoration:'none'}}>Download latest DRO build →</a>
        </section>
        <h2>Install / update</h2>
        <ol style={{lineHeight:2,color:'#c6d0ca'}}>
          <li>Download the latest DRO ZIP from the build page above.</li>
          <li>Extract the ZIP.</li>
          <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>.</li>
          <li>Enable Developer mode and choose <b>Load unpacked</b>.</li>
          <li>Select the extracted <code>extension</code> folder.</li>
          <li>If the previous unpacked DRO is already installed, press <b>Reload</b> on that extension, then reload the website.</li>
        </ol>
        <p style={{color:'#7ff2a5',fontWeight:700}}>Important: replacing files on the server does not update an already-loaded unpacked extension in the browser. Chrome/Edge must reload the extension once.</p>
        <Link href="/" style={{color:'#7ff2a5'}}>← Back to Market Intelligence</Link>
      </div>
    </main>
  );
}
