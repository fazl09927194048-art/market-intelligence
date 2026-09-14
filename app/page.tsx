const news = [
  {tag:'CRYPTO',title:'Bitcoin holds focus as macro expectations drive risk appetite',meta:'Markets · 12 min ago'},
  {tag:'MACRO',title:'Traders reassess rate path as fresh economic signals arrive',meta:'Macro · 28 min ago'},
  {tag:'DIGITAL ASSETS',title:'Ethereum and major altcoins track a volatile session',meta:'Crypto · 41 min ago'},
  {tag:'MARKETS',title:'Gold, oil and equities move as investors price new risk',meta:'Commodities · 1 hr ago'},
];
const signals = [['Risk appetite','High',82],['Crypto momentum','Positive',74],['Macro uncertainty','Elevated',61],['Volatility','Moderate',48]];

export default function Home(){return <main className="shell">
  <header className="top"><div className="brand">MARKET<span>/</span>INTEL</div><nav className="nav"><a href="#news">News</a><a href="#markets">Markets</a><a href="#signals">Signals</a><a href="#watchlist">Watchlist</a></nav></header>
  <section className="hero"><div><div className="eyebrow">Global market intelligence</div><h1>See the market before it moves.</h1><p>Crypto, equities, commodities, forex and macro headlines in one fast intelligence dashboard.</p></div><div className="live"><i className="dot"/>LIVE FEED</div></section>
  <section className="ticker" id="markets">{[['BTC/USD','$104,820','+1.84%'],['ETH/USD','$3,781','+2.21%'],['S&P 500','6,522.17','+0.41%'],['Gold','$3,648.20','-0.28%']].map(x=><div className="card" key={x[0]}><div className="label">{x[0]}</div><div className="price">{x[1]}</div><div className={x[2].startsWith('+')?'up':'down'}>{x[2]}</div></div>)}</section>
  <section className="grid"><div className="section" id="news"><div className="sectionHead"><h2>Breaking & important news</h2><small>Latest</small></div>{news.map(n=><article className="news" key={n.title}><div><div className="tag">{n.tag}</div><h3>{n.title}</h3><p>{n.meta}</p></div><div className="time">→</div></article>)}</div>
  <aside className="section" id="signals"><div className="sectionHead"><h2>Market signals</h2><small>AI-ready</small></div>{signals.map(s=><div className="signal" key={s[0]}><strong>{s[0]}</strong><span style={{float:'right'}}>{s[1]}</span><div className="bar"><i style={{width:`${s[2]}%`}}/></div></div>)}<div className="signal"><strong>Watchlist</strong><p style={{color:'#778294',fontSize:12,lineHeight:1.6}}>BTC · ETH · SOL · NVDA · GOLD<br/>Personalized alerts will be connected in the next layer.</p></div></aside></section>
  <footer className="footer">Market Intelligence · Data providers will be connected through server-side adapters · Not financial advice</footer>
</main>}