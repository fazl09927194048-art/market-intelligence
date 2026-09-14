'use client';

import { useEffect, useMemo, useState } from 'react';

type Market = { symbol: string; name: string; price: number; change: number; currency?: string };
type Story = { title: string; source: string; publishedAt: string; url: string; category: string };

const fallbackMarkets: Market[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 0, change: 0 },
  { symbol: 'ETH', name: 'Ethereum', price: 0, change: 0 },
  { symbol: 'SOL', name: 'Solana', price: 0, change: 0 },
  { symbol: 'BNB', name: 'BNB', price: 0, change: 0 },
];

const fallbackNews: Story[] = [
  { title: 'Live market feed is connecting to public data sources.', source: 'Market Intel', publishedAt: new Date().toISOString(), url: '#', category: 'SYSTEM' },
  { title: 'Crypto, macro and global-market headlines will appear here.', source: 'Market Intel', publishedAt: new Date().toISOString(), url: '#', category: 'MARKETS' },
];

function money(value: number) {
  if (!value) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value > 100 ? 0 : 2 }).format(value);
}
function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? 'now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>(fallbackMarkets);
  const [news, setNews] = useState<Story[]>(fallbackNews);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState('—');

  async function refresh() {
    setLoading(true);
    try {
      const [m, n] = await Promise.all([fetch('/api/market', { cache: 'no-store' }), fetch('/api/news', { cache: 'no-store' })]);
      if (m.ok) setMarkets((await m.json()).markets ?? fallbackMarkets);
      if (n.ok) setNews((await n.json()).news ?? fallbackNews);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); const id = setInterval(refresh, 60000); return () => clearInterval(id); }, []);

  const filteredNews = useMemo(() => news.filter(x => `${x.title} ${x.source} ${x.category}`.toLowerCase().includes(query.toLowerCase())), [news, query]);

  return <main className="shell">
    <header className="top">
      <a className="brand" href="#top">MARKET<span>/</span>INTEL</a>
      <nav className="nav"><a href="#news">News</a><a href="#markets">Markets</a><a href="#signals">Signals</a><a href="#watchlist">Watchlist</a></nav>
      <button className="refresh" onClick={refresh}>{loading ? 'SYNCING…' : '↻ Refresh'}</button>
    </header>

    <section className="hero" id="top">
      <div><div className="eyebrow"><i className="dot"/> Global market intelligence</div><h1>See the market.<br/><em>Before it moves.</em></h1><p>Crypto prices and global-market headlines in one fast, dark intelligence dashboard.</p></div>
      <div className="status"><b>LIVE DATA</b><span>Updated {lastUpdated}</span><small>Public sources · server-side aggregation</small></div>
    </section>

    <section className="ticker" id="markets">
      {markets.map(x => <div className="card" key={x.symbol}><div className="label">{x.symbol}/USD</div><div className="price">{money(x.price)}</div><div className={x.change >= 0 ? 'up' : 'down'}>{x.change >= 0 ? '+' : ''}{x.change.toFixed(2)}%</div><div className="mini">24h change</div></div>)}
    </section>

    <div className="toolbar"><div className="sectionTitle"><span>INTELLIGENCE FEED</span><b>Breaking & important news</b></div><input aria-label="Search news" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search headlines…"/></div>

    <section className="grid">
      <div className="section" id="news"><div className="sectionHead"><h2>Latest intelligence</h2><small>{filteredNews.length} stories</small></div>
        {filteredNews.slice(0, 12).map((n, i) => <a className="news" href={n.url} target={n.url === '#' ? undefined : '_blank'} rel="noreferrer" key={`${n.title}-${i}`}><div className="rank">{String(i + 1).padStart(2, '0')}</div><div><div className="tag">{n.category} · {n.source}</div><h3>{n.title}</h3><p>{ago(n.publishedAt)}</p></div><div className="arrow">↗</div></a>)}
      </div>
      <aside className="section" id="signals"><div className="sectionHead"><h2>Market pulse</h2><small>Live</small></div>
        {markets.slice(0, 4).map((m, i) => <div className="signal" key={m.symbol}><div><strong>{m.name}</strong><span>{money(m.price)}</span></div><div className="signalRow"><span className={m.change >= 0 ? 'up' : 'down'}>{m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%</span><div className="bar"><i style={{ width: `${Math.min(100, Math.max(5, 50 + m.change * 8))}%` }}/></div></div></div>)}
        <div className="signal" id="watchlist"><strong>Watchlist</strong><p>BTC · ETH · SOL · BNB</p><small>Personalized alerts are ready for the next account layer.</small></div>
      </aside>
    </section>
    <footer className="footer"><b>MARKET/INTEL</b> · Crypto + Markets Intelligence · Data can be delayed · Not financial advice</footer>
  </main>;
}