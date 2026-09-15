export type NewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  category: string;
  assets: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'BREAKING';
  credibility: number;
  freshnessMs: number;
};

const ASSET_TERMS: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'], SOL: ['solana', 'sol'], BNB: ['bnb', 'binance coin'], XRP: ['xrp', 'ripple'], ADA: ['cardano', 'ada'], DOGE: ['dogecoin', 'doge'], AVAX: ['avalanche', 'avax'], LINK: ['chainlink', 'link'], DOT: ['polkadot', 'dot'], SUI: ['sui'], TON: ['toncoin', 'ton'], TRX: ['tron', 'trx'], LTC: ['litecoin', 'ltc'], UNI: ['uniswap', 'uni'], AAVE: ['aave'],
};
const POSITIVE = ['approval', 'approved', 'adoption', 'inflow', 'surge', 'rally', 'bullish', 'record high', 'launch', 'partnership', 'upgrade', 'growth'];
const NEGATIVE = ['hack', 'exploit', 'ban', 'lawsuit', 'outflow', 'crash', 'plunge', 'bearish', 'liquidation', 'fraud', 'breach', 'shutdown'];
const BREAKING = ['breaking', 'halted', 'hack', 'exploit', 'etf approval', 'sec', 'war', 'sanction', 'emergency', 'bankruptcy'];
const SOURCE_WEIGHT: Record<string, number> = { Reuters: 0.95, Bloomberg: 0.95, CNBC: 0.88, CoinDesk: 0.86, Cointelegraph: 0.82, CryptoSlate: 0.80, 'Bitcoin Magazine': 0.80, Decrypt: 0.80, 'Yahoo Finance': 0.82 };

function scoreTerms(text: string, terms: string[]) { return terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0); }

export function enrichNews(items: Array<{title:string;source:string;publishedAt:string;url:string;category:string}>): NewsItem[] {
  const now = Date.now();
  const seen = new Set<string>();
  return items.map(item => {
    const text = item.title.toLowerCase();
    const assets = Object.entries(ASSET_TERMS).filter(([, terms]) => terms.some(t => text.includes(t))).map(([a]) => a);
    const pos = scoreTerms(text, POSITIVE), neg = scoreTerms(text, NEGATIVE);
    const sentiment: NewsItem['sentiment'] = pos > neg ? 'BULLISH' : neg > pos ? 'BEARISH' : 'NEUTRAL';
    const breaking = BREAKING.some(t => text.includes(t));
    const impact: NewsItem['impact'] = breaking ? 'BREAKING' : Math.abs(pos-neg) >= 2 || assets.length >= 2 ? 'HIGH' : assets.length ? 'MEDIUM' : 'LOW';
    const parsed = Date.parse(item.publishedAt);
    const freshnessMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY;
    return { ...item, assets, sentiment, impact, credibility: SOURCE_WEIGHT[item.source] ?? 0.65, freshnessMs };
  }).filter(item => {
    const key = `${item.source}:${item.url}:${item.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => (a.impact === 'BREAKING' ? -1 : b.impact === 'BREAKING' ? 1 : b.publishedAt.localeCompare(a.publishedAt)));
}

export function detectEvents(news: NewsItem[]) {
  return news.filter(n => n.impact === 'BREAKING' || n.impact === 'HIGH').map(n => ({
    id: `${n.source}:${n.publishedAt}:${n.title.slice(0, 40)}`,
    type: n.impact === 'BREAKING' ? 'BREAKING_NEWS' : 'MARKET_EVENT',
    title: n.title, source: n.source, assets: n.assets, sentiment: n.sentiment, impact: n.impact,
    credibility: n.credibility, publishedAt: n.publishedAt, detectedAt: new Date().toISOString(), url: n.url,
  }));
}
