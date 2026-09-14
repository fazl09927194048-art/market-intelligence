import { getMarkets } from '@/lib/market';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { buildSignal, buildForecast } from '@/lib/signal';
import { enrichNews, detectEvents, type NewsItem } from '@/lib/news-intelligence';
import { runAnalystBrain, synthesizeOpinions } from '@/lib/analyst-brain';

type Story = { title:string; source:string; publishedAt:string; url:string; category:string };
const FEEDS = [
  { url:'https://www.coindesk.com/arc/outboundfeeds/rss/', category:'CRYPTO', source:'CoinDesk' },
  { url:'https://www.cnbc.com/id/100003114/device/rss/rss.html', category:'MARKETS', source:'CNBC' },
];
function clean(v:string){ return v.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim(); }
function parse(xml:string, category:string, source:string):Story[]{ return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0,10).map(b=>{ const x=b[0], get=(t:string)=>clean(x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`,'i'))?.[1]??''); const d=get('pubDate'); return {title:get('title'),url:get('link')||get('guid'),source,category,publishedAt:d&& !Number.isNaN(Date.parse(d))?new Date(d).toISOString():new Date().toISOString()}; }).filter(x=>x.title&&x.url); }
async function loadNews():Promise<NewsItem[]>{ const rs=await Promise.allSettled(FEEDS.map(async f=>{const r=await fetch(f.url,{headers:{'User-Agent':'MarketIntelligence/1.0'},cache:'no-store'});if(!r.ok)throw new Error(`${f.source}:${r.status}`);return parse(await r.text(),f.category,f.source);})); return enrichNews(rs.flatMap(r=>r.status==='fulfilled'?r.value:[])); }

export async function runIntelligenceCycle(symbol='BTCUSDT', interval='15m') {
  const [market, advanced, news] = await Promise.all([getMarkets(), getAdvancedMarketData(symbol, interval, 200), loadNews()]);
  const candles = advanced.futures.candles.length >= 20 ? advanced.futures.candles : advanced.spot.candles;
  const technical = analyzeTechnical(candles, advanced.spot.orderBook.bids, advanced.spot.orderBook.asks);
  const signal = buildSignal(advanced, technical);
  const forecast = buildForecast(advanced, technical, signal);
  const assetNews = news.filter(n => n.assets.includes(symbol.replace('USDT','')) || n.assets.length === 0);
  const events = detectEvents(assetNews);
  const analysts = await runAnalystBrain(advanced, technical, assetNews);
  const consensus = synthesizeOpinions(analysts);
  return { cycleId:`${symbol}-${Date.now()}`, generatedAt:new Date().toISOString(), symbol, interval, market, marketData:advanced, technical, signal, forecast, analysts, consensus, news:assetNews.slice(0,20), events:events.slice(0,10), dataValid:market.markets.length>0&&candles.length>=20&&technical.confidence>=50, sourceHealth:advanced.sourceHealth, warnings:[...market.warnings,...advanced.warnings,...technical.warnings] };
}
