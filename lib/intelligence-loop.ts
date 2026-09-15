import { getMarkets } from '@/lib/market';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { analyzeChartPatterns } from '@/lib/chart-patterns';
import { buildSignal, buildForecast } from '@/lib/signal';
import { assessRisk } from '@/lib/risk-engine';
import { enrichNews, detectEvents, type NewsItem } from '@/lib/news-intelligence';
import { assessEventReaction } from '@/lib/event-reaction';
import { analyzeMultiTimeframe } from '@/lib/multi-timeframe';
import { runAnalystBrain, synthesizeOpinions } from '@/lib/analyst-brain';
import { normalizeChartContext, normalizeInterval, type ChartContext } from '@/lib/chart-context';
import { recordForecastSnapshot } from '@/lib/forecast-snapshots';

type Story = { title: string; source: string; publishedAt: string; url: string; category: string };
const FEEDS = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'CRYPTO', source: 'CoinDesk' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'MARKETS', source: 'CNBC' },
];
const NEWS_TIMEOUT_MS = 8_000;

function clean(value: string): string {
  return value.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parse(xml: string, category: string, source: string): Story[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 20).map(block => {
    const item = block[0];
    const get = (tag: string) => clean(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? '');
    const published = get('pubDate');
    const parsedDate = published ? Date.parse(published) : NaN;
    return { title: get('title'), url: get('link') || get('guid'), source, category, publishedAt: Number.isNaN(parsedDate) ? new Date().toISOString() : new Date(parsedDate).toISOString() };
  }).filter(story => story.title.length > 0 && story.url.length > 0);
}

async function loadNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(async feed => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);
    try {
      const response = await fetch(feed.url, { headers: { 'User-Agent': 'MarketIntelligence/1.0' }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`${feed.source}:${response.status}`);
      return parse(await response.text(), feed.category, feed.source);
    } finally {
      clearTimeout(timer);
    }
  }));
  return enrichNews(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
}

function summarizeNewsImpact(news: NewsItem[], events: ReturnType<typeof detectEvents>) {
  const breaking = events.filter(e => e.impact === 'BREAKING');
  const high = events.filter(e => e.impact === 'HIGH');
  const bullish = news.filter(n => n.sentiment === 'BULLISH' && (n.impact === 'HIGH' || n.impact === 'BREAKING')).length;
  const bearish = news.filter(n => n.sentiment === 'BEARISH' && (n.impact === 'HIGH' || n.impact === 'BREAKING')).length;
  const newest = [...news].sort((a, b) => a.freshnessMs - b.freshnessMs)[0];
  return { level: breaking.length ? 'BREAKING' : high.length ? 'HIGH' : news.length ? 'MEDIUM' : 'NONE', breakingCount: breaking.length, highImpactCount: high.length, bullishHighImpact: bullish, bearishHighImpact: bearish, latestPublishedAt: newest?.publishedAt ?? null, latestAgeMs: newest?.freshnessMs ?? null, headlines: breaking.slice(0, 5).map(e => ({ title: e.title, source: e.source, assets: e.assets, sentiment: e.sentiment, url: e.url, publishedAt: e.publishedAt })) };
}

function horizonMs(interval: string) {
  const m = interval.match(/^(\d+)(m|h|d|w|M)$/);
  if (!m) return 3_600_000;
  const n = Number(m[1]);
  const unit = m[2];
  const ms = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : unit === 'w' ? 604_800_000 : 30 * 86_400_000;
  return n * ms * 8;
}

export async function runIntelligenceCycle(symbol = 'BTCUSDT', interval = '15m', chartInput?: Partial<ChartContext> | null) {
  const safeSymbol = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const safeInterval = normalizeInterval(interval);
  const chart = normalizeChartContext(chartInput, safeSymbol, safeInterval);
  const [market, advanced, news, multiTimeframe] = await Promise.all([getMarkets(), getAdvancedMarketData(safeSymbol, safeInterval, 200), loadNews(), analyzeMultiTimeframe(safeSymbol, safeInterval)]);
  const candles = advanced.futures.candles.length >= 20 ? advanced.futures.candles : advanced.spot.candles;
  const technical = analyzeTechnical(candles, advanced.spot.orderBook.bids, advanced.spot.orderBook.asks);
  const chartPatterns = analyzeChartPatterns(candles);
  const signal = buildSignal(advanced, technical);
  const forecast = buildForecast(advanced, technical);
  const risk = assessRisk(advanced, technical, signal);
  const asset = safeSymbol.replace(/USDT$/i, '').toUpperCase();
  const assetNews = news.filter(item => item.assets.includes(asset) || item.assets.length === 0);
  const events = detectEvents(assetNews);
  const newsImpact = summarizeNewsImpact(assetNews, events);
  const eventReaction = assessEventReaction(assetNews, risk);
  const analysts = await runAnalystBrain(advanced, technical, assetNews);
  const consensus = synthesizeOpinions(analysts);
  const cycleId = `${safeSymbol}-${Date.now()}`;
  const warnings = [...market.warnings, ...advanced.warnings, ...technical.warnings, ...chartPatterns.warnings, ...risk.reasons, ...eventReaction.reasons, ...multiTimeframe.warnings];
  if (newsImpact.level === 'BREAKING') warnings.push(`Breaking news detected: ${newsImpact.breakingCount} high-priority event(s); revalidate directional risk before acting.`);
  if (eventReaction.level === 'CRITICAL') warnings.push('Event reaction is CRITICAL: new directional decisions should be treated as blocked until fresh confirmation.');
  if (newsImpact.latestAgeMs !== null && newsImpact.latestAgeMs > 6 * 60 * 60 * 1000) warnings.push('News feed is older than 6 hours; news-derived context may be stale.');
  if (chart?.quality === 'partial') warnings.push('Browser chart context is partial: page price was observed but could not be fully verified.');
  if (chart?.quality === 'verified' && chart.ageMs > 120000) warnings.push('Browser chart context is older than 2 minutes.');
  if (multiTimeframe.conflict) warnings.push('Timeframe conflict detected: directional structure disagrees across sampled intervals.');
  const startPrice = advanced.futures.price ?? advanced.spot.price;
  const forecastAt = new Date().toISOString();
  if (startPrice !== null && Number.isFinite(startPrice) && startPrice > 0 && forecast.bias !== 'UNAVAILABLE') {
    const forecastBucket = Math.floor(Date.now() / 60_000);
    const snapshotId = `${safeSymbol}:${safeInterval}:${forecastBucket}`;
    void recordForecastSnapshot({ id: snapshotId, symbol: safeSymbol, interval: safeInterval, forecastAt, bias: forecast.bias, confidence: forecast.confidence, startPrice, expectedLow: forecast.expectedLow, expectedHigh: forecast.expectedHigh, horizonMs: horizonMs(safeInterval), cycleId }).catch(() => undefined);
  }
  return { cycleId, generatedAt: forecastAt, symbol: safeSymbol, interval: safeInterval, chartContext: chart, chartPatterns, multiTimeframe, risk, eventReaction, market, marketData: advanced, technical, signal, forecast, analysts, consensus, news: assetNews.slice(0, 20), events: events.slice(0, 10), newsImpact, dataValid: market.markets.length > 0 && candles.length >= 20 && technical.confidence >= 50, sourceHealth: advanced.sourceHealth, warnings };
}
