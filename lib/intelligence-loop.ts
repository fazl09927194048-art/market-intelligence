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
  { url: 'https://cointelegraph.com/rss', category: 'CRYPTO', source: 'Cointelegraph' },
  { url: 'https://cryptoslate.com/feed/', category: 'CRYPTO', source: 'CryptoSlate' },
  { url: 'https://bitcoinmagazine.com/.rss/full/', category: 'CRYPTO', source: 'Bitcoin Magazine' },
  { url: 'https://decrypt.co/feed', category: 'CRYPTO', source: 'Decrypt' },
  { url: 'https://finance.yahoo.com/news/rssindex', category: 'MARKETS', source: 'Yahoo Finance' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'MACRO', source: 'BBC Business' },
] as const;
const NEWS_TIMEOUT_MS = 4_000;
const NEWS_CACHE_TTL_MS = 20_000;
const CYCLE_CACHE_TTL_MS = 8_000;
let newsCache: { at: number; data: NewsItem[] } | null = null;
let newsInFlight: Promise<NewsItem[]> | null = null;
const cycleCache=new Map<string,{at:number;result:Awaited<ReturnType<typeof runCycleInternal>>}>();

function clean(value: string): string { return value.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim(); }
function parse(xml: string, category: string, source: string): Story[] { return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 30).map(block => { const item = block[0]; const get = (tag: string) => clean(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? ''); const published = get('pubDate') || get('published') || get('updated'); const parsedDate = published ? Date.parse(published) : NaN; return { title: get('title'), url: get('link') || get('guid'), source, category, publishedAt: Number.isNaN(parsedDate) ? new Date().toISOString() : new Date(parsedDate).toISOString() }; }).filter(story => story.title.length > 0 && story.url.length > 0); }
async function loadNews(): Promise<NewsItem[]> {
  const now=Date.now();
  if(newsCache&&now-newsCache.at<NEWS_CACHE_TTL_MS)return newsCache.data;
  if(newsInFlight)return newsInFlight;
  newsInFlight=(async()=>{
    const results=await Promise.allSettled(FEEDS.map(async feed=>{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),NEWS_TIMEOUT_MS);
      try{
        const response=await fetch(feed.url,{headers:{'User-Agent':'MarketIntelligence/1.0 (+live-news)'},cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error(`${feed.source}:${response.status}`);
        return parse(await response.text(),feed.category,feed.source);
      }finally{clearTimeout(timer);}
    }));
    const data=enrichNews(results.flatMap(result=>result.status==='fulfilled'?result.value:[]));
    newsCache={at:Date.now(),data};
    return data;
  })().finally(()=>{newsInFlight=null;});
  return newsInFlight;
}
function summarizeNewsImpact(news: NewsItem[], events: ReturnType<typeof detectEvents>) { const breaking = events.filter(e => e.impact === 'BREAKING'); const high = events.filter(e => e.impact === 'HIGH'); const bullish = news.filter(n => n.sentiment === 'BULLISH' && (n.impact === 'HIGH' || n.impact === 'BREAKING')).length; const bearish = news.filter(n => n.sentiment === 'BEARISH' && (n.impact === 'HIGH' || n.impact === 'BREAKING')).length; const newest = [...news].sort((a, b) => a.freshnessMs - b.freshnessMs)[0]; return { level: breaking.length ? 'BREAKING' : high.length ? 'HIGH' : news.length ? 'MEDIUM' : 'NONE', breakingCount: breaking.length, highImpactCount: high.length, bullishHighImpact: bullish, bearishHighImpact: bearish, latestPublishedAt: newest?.publishedAt ?? null, latestAgeMs: newest?.freshnessMs ?? null, sourceCount: new Set(news.map(n => n.source)).size, headlines: breaking.slice(0, 5).map(e => ({ title: e.title, source: e.source, assets: e.assets, sentiment: e.sentiment, url: e.url, publishedAt: e.publishedAt })) }; }
function horizonMs(interval: string) { const m = interval.match(/^(\d+)(m|h|d|w|M)$/); if (!m) return 3_600_000; const n = Number(m[1]); const unit = m[2]; const ms = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : unit === 'w' ? 604_800_000 : 30 * 86_400_000; return n * ms * 8; }

const cycleInFlight=new Map<string,ReturnType<typeof runCycleInternal>>();
async function runCycleInternal(safeSymbol:string,safeInterval:string,chart:ChartContext){
  const [market, advanced, news, multiTimeFrame] = await Promise.all([getMarkets(), getAdvancedMarketData(safeSymbol, safeInterval, 200), loadNews(), analyzeMultiTimeframe(safeSymbol, safeInterval)]);
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
  const warnings = [...market.warnings, ...advanced.warnings, ...technical.warnings, ...chartPatterns.warnings, ...risk.reasons, ...eventReaction.reasons, ...multiTimeFrame.warnings];
  if (newsImpact.level === 'NONE') warnings.push('All configured news sources returned no validated stories for this cycle.'); else if (newsImpact.sourceCount < 2) warnings.push(`News coverage is currently limited to ${newsImpact.sourceCount} validated source(s).`);
  if (newsImpact.level === 'BREAKING') warnings.push(`Breaking news detected: ${newsImpact.breakingCount} high-priority event(s); revalidate directional risk before acting.`);
  if (eventReaction.level === 'CRITICAL') warnings.push('Event reaction is CRITICAL: new directional decisions should be treated as blocked until fresh confirmation.');
  if (newsImpact.latestAgeMs !== null && newsImpact.latestAgeMs > 6 * 60 * 60 * 1000) warnings.push('News feed is older than 6 hours; news-derived context may be stale.');
  if (chart.quality === 'partial') warnings.push('Browser chart context is partial: page price was observed but could not be fully verified.');
  if (chart.quality === 'verified' && chart.ageMs > 120000) warnings.push('Browser chart context is older than 2 minutes.');
  if (multiTimeFrame.conflict) warnings.push('Timeframe conflict detected: directional structure disagrees across sampled intervals.');
  const startPrice = advanced.futures.price ?? advanced.spot.price;
  const forecastAt = new Date().toISOString();
  if(startPrice!==null&&Number.isFinite(startPrice)&&startPrice>0&&forecast.bias!=='UNAVAILABLE'){
    const forecastBucket=Math.floor(Date.now()/60000);
    const snapshotId=`${safeSymbol}:${safeInterval}:${forecastBucket}`;
    void recordForecastSnapshot({id:snapshotId,symbol:safeSymbol,interval:safeInterval,forecastAt,bias:forecast.bias,confidence:forecast.confidence,startPrice,expectedLow:forecast.expectedLow,expectedHigh:forecast.expectedHigh,horizonMs:horizonMs(safeInterval),cycleId}).catch(()=>undefined);
  }
  return {cycleId,generatedAt:forecastAt,symbol:safeSymbol,interval:safeInterval,chartContext:chart,chartPatterns,multiTimeframe:multiTimeFrame,risk,eventReaction,market,marketData:advanced,technical,signal,forecast,analysts,consensus,news:assetNews.slice(0,30),events:events.slice(0,10),newsImpact,dataValid:market.markets.length>0&&candles.length>=20&&technical.confidence>=50,sourceHealth:{...market.sourceHealth,...advanced.sourceHealth},warnings};
}

export async function runIntelligenceCycle(symbol='BTCUSDT',interval='15m',chartInput?:Partial<ChartContext>|null){
  const safeSymbol=String(symbol).toUpperCase().replace(/[^A-Z0-9]/g,'')||'BTCUSDT';
  const safeInterval=normalizeInterval(interval);
  const chart=normalizeChartContext(chartInput,safeSymbol,safeInterval) ?? { source:'browser', symbol:safeSymbol, interval:safeInterval, pagePrice:null, observedAt:new Date().toISOString(), extraction:'none', quality:'none', ageMs:0 };
  const key=`${safeSymbol}:${safeInterval}`;
  const cached=cycleCache.get(key);
  if(cached&&Date.now()-cached.at<CYCLE_CACHE_TTL_MS){return {...cached.result,cycleId:`${safeSymbol}-cached-${cached.at}`,generatedAt:new Date(cached.result.generatedAt).toISOString(),chartContext:chart};}
  const pending=cycleInFlight.get(key);
  if(pending){const result=await pending;return {...result,cycleId:`${safeSymbol}-shared-${Date.now()}`,generatedAt:new Date().toISOString(),chartContext:chart};}
  const promise=runCycleInternal(safeSymbol,safeInterval,chart).then(result=>{cycleCache.set(key,{at:Date.now(),result});if(cycleCache.size>24){const oldest=[...cycleCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(oldest)cycleCache.delete(oldest[0]);}return result;}).finally(()=>cycleInFlight.delete(key));
  cycleInFlight.set(key,promise);
  return promise;
}
