import { NextResponse } from 'next/server';
import { enrichNews } from '@/lib/news-intelligence';

export const revalidate = 300;

type Story = { title: string; source: string; publishedAt: string; url: string; category: string };
const feeds = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'CRYPTO', source: 'CoinDesk' },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'MARKETS', source: 'CNBC' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', category: 'BUSINESS', source: 'Reuters' },
];
function clean(value: string) { return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
function parse(xml: string, category: string, source: string): Story[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 12).map(block => {
    const x = block[0]; const get = (tag: string) => clean(x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '');
    const title = get('title'); const url = get('link') || get('guid'); const date = get('pubDate') || get('dc:date');
    return { title, url, source, category, publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString() };
  }).filter(x => x.title && x.url);
}
export async function GET() {
  const results = await Promise.allSettled(feeds.map(async feed => { const res = await fetch(feed.url, { headers: { 'User-Agent': 'MarketIntelligence/1.0' }, next: { revalidate: 300 } }); if (!res.ok) throw new Error(String(res.status)); return parse(await res.text(), feed.category, feed.source); }));
  const all = results.flatMap(x => x.status === 'fulfilled' ? x.value : []); const seen = new Set<string>();
  const base = all.filter(item => { const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 100); if (!key || seen.has(key)) return false; seen.add(key); return true; }).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 30);
  const news = enrichNews(base); const events = news.filter(n => n.impact === 'BREAKING' || n.impact === 'HIGH');
  return NextResponse.json({ news, events, updatedAt: new Date().toISOString(), sources: feeds.map(x => x.source), sourceHealth: results.map((r,i) => ({ source: feeds[i].source, status: r.status })) }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600', 'Access-Control-Allow-Origin': '*' } });
}