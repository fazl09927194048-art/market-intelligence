import Link from 'next/link';

export default function ExtensionPage() {
  return (
    <main style={{minHeight:'100vh',background:'#06080c',color:'#eef5f1',padding:'48px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:900,margin:'0 auto'}}>
        <div style={{color:'#7ff2a5',fontWeight:900,letterSpacing:2}}>DRO</div>
        <h1 style={{fontSize:'clamp(38px,7vw,72px)',margin:'12px 0'}}>AI Market Intelligence Extension</h1>
        <p style={{color:'#aab7b0',fontSize:18,lineHeight:1.7}}>Real-time chart intelligence for Binance, KuCoin and TradingView with live WebSocket market data, 33 analyst views, multi-timeframe analysis, forecasts, risk, news, event reaction and AI Coach.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,margin:'28px 0'}}>
          {['Live ticker / trade / order book','33 analyst consensus','Multi-timeframe scan','Funding / OI / liquidations','News + event reaction','AI Coach + Deep Scan'].map(x=><div key={x} style={{padding:18,border:'1px solid #26352d',borderRadius:14,background:'#0b100e'}}>{x}</div>)}
        </div>
        <h2>Install in Chrome / Edge</h2>
        <ol style={{lineHeight:2,color:'#c6d0ca'}}>
          <li>Download the latest <b>DRO extension</b> package from the repository Actions artifact.</li>
          <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>.</li>
          <li>Enable Developer mode.</li>
          <li>Choose Load unpacked for the extracted <code>extension</code> folder, or install the packaged build when available.</li>
          <li>Open a supported Binance, KuCoin or TradingView chart. The DRO panel appears automatically.</li>
        </ol>
        <p><a href="https://github.com/fazl09927194048-art/market-intelligence/actions" style={{color:'#7ff2a5'}}>Open DRO build artifacts on GitHub →</a></p>
        <Link href="/" style={{color:'#7ff2a5'}}>← Back to Market Intelligence</Link>
      </div>
    </main>
  );
}
