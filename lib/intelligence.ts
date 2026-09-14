import type { MarketSnapshot } from './market';

export type Intelligence = {
  regime: 'BULLISH'|'BEARISH'|'MIXED'|'NO_DATA';
  direction: 'LONG'|'SHORT'|'NEUTRAL'|'NO TRADE';
  confidence: number;
  score: number;
  thesis: string[];
  risks: string[];
  invalidation: string;
  generatedAt: string;
  dataFresh: boolean;
};

export function analyzeMarket(m: MarketSnapshot[]): Intelligence {
  if (!m.length) return {regime:'NO_DATA',direction:'NO TRADE',confidence:0,score:0,thesis:['No validated live market data is available.'],risks:['Do not infer a trade from missing data.'],invalidation:'Wait for validated live data.',generatedAt:new Date().toISOString(),dataFresh:false};
  const changes=m.map(x=>x.change24h).filter(Number.isFinite);
  const avg=changes.reduce((a,b)=>a+b,0)/(changes.length||1);
  const score=Math.max(-100,Math.min(100,avg*12));
  const regime=avg>1?'BULLISH':avg<-1?'BEARISH':'MIXED';
  const direction=avg>2?'LONG':avg<-2?'SHORT':'NEUTRAL';
  const confidence=Math.round(Math.min(92,50+Math.abs(score)*0.38));
  return {regime,direction,confidence,score,thesis:[`Breadth sample: ${m.length} assets.`,`Average 24h move: ${avg.toFixed(2)}%.`,`Primary regime classification: ${regime}.`],risks:['This is a snapshot, not a guaranteed forecast.','News, liquidity and derivatives can invalidate a price-only view.'],invalidation:'Re-evaluate when fresh market/news inputs materially change.',generatedAt:new Date().toISOString(),dataFresh:m.every(x=>x.freshnessMs<120000)};
}
