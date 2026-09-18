import { getMarkets } from '@/lib/market';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { analyzeChartPatterns } from '@/lib/chart-patterns';
import { buildSignal, buildForecast, applyChartVision, type ChartVisionContext } from '@/lib/signal';
import { assessRisk } from '@/lib/risk-engine';
import { enrichNews, detectEvents, type NewsItem } from '@/lib/news-intelligence';
import { assessEventReaction } from '@/lib/event-reaction';
import { analyzeMultiTimeframe } from '@/lib/multi-timeframe';
import { runAnalystBrain, synthesizeOpinions, buildDecisionAudit } from '@/lib/analyst-brain';
import { normalizeChartContext, normalizeInterval, type ChartContext } from '@/lib/chart-context';
import { recordForecastSnapshot } from '@/lib/forecast-snapshots';
import { buildScenarios } from '@/lib/scenario-engine';
import { evaluateInvalidation } from '@/lib/invalidation-engine';
import { buildDecisionTrace } from '@/lib/decision-trace';
import { initializePersistentMemory, rememberAnalystOpinions, evaluateMaturedPredictions } from '@/lib/analyst-memory';

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

function buildMarketIntelligenceScore(technical:any,multi:any,risk:any,signal:any,scenarios:any,newsImpact:any,advanced:any){
  const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
  const trend=technical?.structure?.trend;
  const trendScore=trend==='UP'||trend==='DOWN'?80:trend==='SIDEWAYS'?50:25;
  const momentum=technical?.indicators?.rsi14;
  const momentumScore=momentum==null?50:(momentum>=55&&momentum<=72)||(momentum>=28&&momentum<=45)?75:55;
  const flow=advanced?.microstructure?.deltaNotional;
  const flowTotal=(advanced?.microstructure?.buyNotional||0)+(advanced?.microstructure?.sellNotional||0);
  const flowScore=flowTotal>0?clamp(50+(flow/flowTotal)*50):50;
  const liquidity=advanced?.microstructure?.orderBookImbalance;
  const liquidityScore=liquidity==null?50:clamp(50+liquidity*100);
  const mtf=multi?.score??50;
  const newsPenalty=newsImpact?.level==='BREAKING'?20:newsImpact?.level==='HIGH'?10:0;
  const riskPenalty=Math.min(35,Number(risk?.score)||0);
  const scenarioRows=Array.isArray(scenarios?.scenarios)?scenarios.scenarios:[];
  const dominantId=String(scenarios?.dominant||'').toLowerCase();
  const dominantScenario=scenarioRows.find((row:any)=>String(row?.id||'').toLowerCase()===dominantId) || [...scenarioRows].sort((a:any,b:any)=>Number(b?.probability||0)-Number(a?.probability||0))[0];
  const scenarioScore=Number.isFinite(Number(dominantScenario?.probability))?Number(dominantScenario.probability):50;
  const raw=trendScore*.18+momentumScore*.12+flowScore*.20+liquidityScore*.12+Number(mtf)*.18+Number(signal?.confidence||0)*.10+scenarioScore*.10-newsPenalty*.35-riskPenalty*.15;
  const score=clamp(raw);
  const regime=technical?.volatility?.regime==='HIGH'?'HIGH_VOLATILITY':trend==='UP'?'TREND_UP':trend==='DOWN'?'TREND_DOWN':trend==='SIDEWAYS'?'SIDEWAYS':'UNKNOWN';
  const manipulationRisk=clamp(Math.abs(Number(liquidity)||0)*100+((technical?.volatility?.regime==='HIGH')?35:0)+(Math.abs(Number(advanced?.derivatives?.basisPct)||0)>0.5?20:0));
  return {score,regime,manipulationRisk,components:{trend:trendScore,momentum:momentumScore,flow:flowScore,liquidity:liquidityScore,multiTimeframe:Number(mtf)||0,signal:Number(signal?.confidence)||0},method:'Weighted live-data intelligence score; not a profit probability.'};
}

const cycleInFlight=new Map<string,ReturnType<typeof runCycleInternal>>();
async function runCycleInternal(safeSymbol:string,safeInterval:string,chart:ChartContext,chartVision?:ChartVisionContext|null){
  await initializePersistentMemory();
  const [market, advanced, news, multiTimeFrame] = await Promise.all([getMarkets(), getAdvancedMarketData(safeSymbol, safeInterval, 200), loadNews(), analyzeMultiTimeframe(safeSymbol, safeInterval)]);
  const candles = advanced.futures.candles.length >= 20 ? advanced.futures.candles : advanced.spot.candles;
  const technical = analyzeTechnical(candles, advanced.spot.orderBook.bids, advanced.spot.orderBook.asks);
  const chartPatterns = analyzeChartPatterns(candles);
  const signal = applyChartVision(buildSignal(advanced, technical), chartVision);
  const forecast = buildForecast(advanced, technical);
  const risk = assessRisk(advanced, technical, signal);
  const scenarios = buildScenarios(advanced, technical, signal, forecast);
  const asset = safeSymbol.replace(/USDT$/i, '').toUpperCase();
  const assetNews = news.filter(item => item.assets.includes(asset) || item.assets.length === 0);
  const events = detectEvents(assetNews);
  const newsImpact = summarizeNewsImpact(assetNews, events);
  const eventReaction = assessEventReaction(assetNews, risk);
  const analysts = await runAnalystBrain(advanced, technical, assetNews);
  const currentPrice = advanced.futures.price ?? advanced.spot.price;
  const regime = String((technical as any).volatilityRegime ?? (technical as any).regime ?? 'UNKNOWN');
  rememberAnalystOpinions(safeSymbol, regime, analysts, currentPrice ?? undefined, safeInterval);
  const outcomeLearning = currentPrice && Number.isFinite(currentPrice) ? evaluateMaturedPredictions(safeSymbol, safeInterval, currentPrice, regime) : { evaluated: 0, skipped: 0 };
  const consensus = synthesizeOpinions(analysts);
  const decisionAudit = buildDecisionAudit(analysts, scenarios);
  const cycleId = `${safeSymbol}-${Date.now()}`;
  const qualityFactors = [
    {id:'market',ok:market.markets.length>0,penalty:12,reason:'market snapshot unavailable'},
    {id:'candles',ok:candles.length>=50,penalty:15,reason:'insufficient candle history'},
    {id:'technical',ok:technical.confidence>=70,penalty:12,reason:'technical confidence is weak'},
    {id:'news',ok:newsImpact.sourceCount>=2 || newsImpact.level==='NONE',penalty:5,reason:'limited news coverage'},
    {id:'timeframe',ok:!multiTimeFrame.conflict,penalty:8,reason:'timeframe conflict detected'},
    {id:'event',ok:eventReaction.level!=='CRITICAL',penalty:15,reason:'critical event reaction'},
  ];
  const qualityPenalty=Math.min(55,qualityFactors.filter(x=>!x.ok).reduce((s,x)=>s+x.penalty,0));
  const confidenceBeforeGate=consensus.confidence;
  const gatedConfidence=Math.max(0,Math.round(confidenceBeforeGate*(1-qualityPenalty/100)));
  const confidenceGate={before:confidenceBeforeGate,after:gatedConfidence,penalty:qualityPenalty,factors:qualityFactors.filter(x=>!x.ok).map(x=>x.reason),status:qualityPenalty>=30?'DEGRADED':qualityPenalty>=15?'CAUTION':'HEALTHY'};
  const warnings = [...market.warnings, ...advanced.warnings, ...technical.warnings, ...chartPatterns.warnings, ...risk.reasons, ...eventReaction.reasons, ...multiTimeFrame.warnings];
  if(qualityPenalty>0) warnings.push(`Decision confidence quality gate applied: -${qualityPenalty}% due to data/context limitations.`);
  if (newsImpact.level === 'NONE') warnings.push('All configured news sources returned no validated stories for this cycle.'); else if (newsImpact.sourceCount < 2) warnings.push(`News coverage is currently limited to ${newsImpact.sourceCount} validated source(s).`);
  if (newsImpact.level === 'BREAKING') warnings.push(`Breaking news detected: ${newsImpact.breakingCount} high-priority event(s); revalidate directional risk before acting.`);
  if (eventReaction.level === 'CRITICAL') warnings.push('Event reaction is CRITICAL: new directional decisions should be treated as blocked until fresh confirmation.');
  if (newsImpact.latestAgeMs !== null && newsImpact.latestAgeMs > 6 * 60 * 60 * 1000) warnings.push('News feed is older than 6 hours; news-derived context may be stale.');
  if (chart.quality === 'partial') warnings.push('Browser chart context is partial: page price was observed but could not be fully verified.');
  if (chart.quality === 'verified' && chart.ageMs > 120000) warnings.push('Browser chart context is older than 2 minutes.');
  if (multiTimeFrame.conflict) warnings.push('Timeframe conflict detected: directional structure disagrees across sampled intervals.');
  const invalidation = evaluateInvalidation(signal, technical, advanced, { confidenceGate, eventReaction, multiTimeframe: multiTimeFrame, scenarios });
  if (invalidation.status === 'NO_TRADE') warnings.push(`Invalidation engine blocked directional execution: ${invalidation.reasons.join(' | ')}`);
  else if (invalidation.status === 'CAUTION') warnings.push(`Invalidation engine raised caution: ${invalidation.reasons.join(' | ')}`);
  const intelligenceScore=buildMarketIntelligenceScore(technical,multiTimeFrame,risk,signal,scenarios,newsImpact,advanced);
  const finalSignal = invalidation.finalSignal === signal.signal ? signal : {
    ...signal,
    signal: 'NO TRADE' as const,
    confidence: Math.min(signal.confidence, gatedConfidence),
    entry: advanced.futures.price ?? advanced.spot.price,
    stopLoss: null,
    takeProfits: [],
    riskReward: null,
    invalidation: invalidation.reasons[0] ?? signal.invalidation,
  };
  const decisionTrace = buildDecisionTrace({ signal: finalSignal, consensus, analysts, confidenceGate, invalidation });
  if (chartVision?.direction && chartVision.direction !== 'UNKNOWN') warnings.push(`Chart vision integrated: ${chartVision.direction} (${Math.round(Number(chartVision.confidence)||0)}% confidence).`);
  const startPrice = advanced.futures.price ?? advanced.spot.price;
  const forecastAt = new Date().toISOString();
  if(startPrice!==null&&Number.isFinite(startPrice)&&startPrice>0&&forecast.bias!=='UNAVAILABLE'){
    const forecastBucket=Math.floor(Date.now()/60000);
    const snapshotId=`${safeSymbol}:${safeInterval}:${forecastBucket}`;
    void recordForecastSnapshot({id:snapshotId,symbol:safeSymbol,interval:safeInterval,forecastAt,bias:forecast.bias,confidence:forecast.confidence,startPrice,expectedLow:forecast.expectedLow,expectedHigh:forecast.expectedHigh,horizonMs:horizonMs(safeInterval),cycleId}).catch(()=>undefined);
  }
  return {cycleId,generatedAt:forecastAt,symbol:safeSymbol,interval:safeInterval,chartContext:chart,intelligenceScore,chartPatterns,multiTimeframe:multiTimeFrame,risk,eventReaction,market,marketData:advanced,technical,signal:finalSignal,forecast,scenarios,analysts,consensus:{...consensus,confidence:gatedConfidence},confidenceGate,decisionAudit,invalidation,decisionTrace,news:assetNews.slice(0,30),events:events.slice(0,10),newsImpact,dataValid:market.markets.length>0&&candles.length>=20&&technical.confidence>=50,sourceHealth:{...market.sourceHealth,...advanced.sourceHealth},warnings, outcomeLearning, memoryLearning: { enabled: true, analystPredictionsRecorded: analysts.length, automaticEvaluation: true }};
}

export async function runIntelligenceCycle(symbol='BTCUSDT',interval='15m',chartInput?:Partial<ChartContext>|null,chartVision?:ChartVisionContext|null){
  const safeSymbol=String(symbol).toUpperCase().replace(/[^A-Z0-9]/g,'')||'BTCUSDT';
  const safeInterval=normalizeInterval(interval);
  const chart=normalizeChartContext(chartInput,safeSymbol,safeInterval) ?? { source:'browser', symbol:safeSymbol, interval:safeInterval, pagePrice:null, observedAt:new Date().toISOString(), extraction:'none', quality:'none', ageMs:0 };
  const key=`${safeSymbol}:${safeInterval}`;
  const cached=cycleCache.get(key);
  if(cached&&Date.now()-cached.at<CYCLE_CACHE_TTL_MS){return {...cached.result,cycleId:`${safeSymbol}-cached-${cached.at}`,generatedAt:new Date(cached.result.generatedAt).toISOString(),chartContext:chart};}
  const pending=cycleInFlight.get(key);
  if(pending){const result=await pending;return {...result,cycleId:`${safeSymbol}-shared-${Date.now()}`,generatedAt:new Date().toISOString(),chartContext:chart};}
  const promise=runCycleInternal(safeSymbol,safeInterval,chart,chartVision).then(result=>{cycleCache.set(key,{at:Date.now(),result});if(cycleCache.size>24){const oldest=[...cycleCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(oldest)cycleCache.delete(oldest[0]);}return result;}).finally(()=>cycleInFlight.delete(key));
  cycleInFlight.set(key,promise);
  return promise;
}
