import { getMarkets } from '@/lib/market';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { buildSignal, buildForecast } from '@/lib/signal';
import { enrichNews, detectEvents, type NewsItem } from '@/lib/news-intelligence';
import { runAnalystBrain, synthesizeOpinions } from '@/lib/analyst-brain';

type Story = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  category: string;
};

const FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'CRYPTO', source: 'CoinDesk' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'MARKETS', source: 'CNBC' },
];

function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parse(xml: string, category: string, source: string): Story[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .slice(0, 20)
    .map((block) => {
      const item = block[0];
      const get = (tag: string) => {
        const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
        return clean(match?.[1] ?? '');
      };
      const published = get('pubDate');
      const parsedDate = published ? Date.parse(published) : NaN;
      return {
        title: get('title'),
        url: get('link') || get('guid'),
        source,
        category,
        publishedAt: Number.isNaN(parsedDate) ? new Date().toISOString() : new Date(parsedDate).toISOString(),
      };
    })
    .filter((story) => story.title.length > 0 && story.url.length > 0);
}

async function loadNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'MarketIntelligence/1.0' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`${feed.source}:${response.status}`);
      return parse(await response.text(), feed.category, feed.source);
    }),
  );

  return enrichNews(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
}

export async function runIntelligenceCycle(symbol = 'BTCUSDT', interval = '15m') {
  const [market, advanced, news] = await Promise.all([
    getMarkets(),
    getAdvancedMarketData(symbol, interval, 200),
    loadNews(),
  ]);

  const candles = advanced.futures.candles.length >= 20
    ? advanced.futures.candles
    : advanced.spot.candles;
  const technical = analyzeTechnical(
    candles,
    advanced.spot.orderBook.bids,
    advanced.spot.orderBook.asks,
  );
  const signal = buildSignal(advanced, technical);
  const forecast = buildForecast(advanced, technical);
  const asset = symbol.replace(/USDT$/i, '').toUpperCase();
  const assetNews = news.filter((item) => item.assets.includes(asset) || item.assets.length === 0);
  const events = detectEvents(assetNews);
  const analysts = await runAnalystBrain(advanced, technical, assetNews);
  const consensus = synthesizeOpinions(analysts);

  const warnings = [
    ...market.warnings,
    ...advanced.warnings,
    ...technical.warnings,
  ];

  return {
    cycleId: `${symbol}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    symbol,
    interval,
    market,
    marketData: advanced,
    technical,
    signal,
    forecast,
    analysts,
    consensus,
    news: assetNews.slice(0, 20),
    events: events.slice(0, 10),
    dataValid: market.markets.length > 0 && candles.length >= 20 && technical.confidence >= 50,
    sourceHealth: advanced.sourceHealth,
    warnings,
  };
}
