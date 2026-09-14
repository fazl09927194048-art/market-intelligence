import type { NewsItem } from './news-intelligence';
import type { RiskSnapshot } from './risk-engine';

export type EventReaction = {
  level: 'NONE' | 'WATCH' | 'ELEVATED' | 'CRITICAL';
  urgency: 'NORMAL' | 'FAST' | 'IMMEDIATE';
  affectedAssets: string[];
  direction: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
  score: number;
  reasons: string[];
  actions: string[];
  events: Array<{title:string;source:string;assets:string[];impact:string;sentiment:string;credibility:number;ageMs:number}>;
};

export function assessEventReaction(news:NewsItem[],risk:RiskSnapshot):EventReaction{
  const relevant=news.filter(n=>(n.impact==='BREAKING'||n.impact==='HIGH')&&n.freshnessMs<=2*60*60*1000).slice(0,10);
  if(!relevant.length)return{level:'NONE',urgency:'NORMAL',affectedAssets:[],direction:'NEUTRAL',score:0,reasons:[],actions:[],events:[]};
  const assets=[...new Set(relevant.flatMap(n=>n.assets))];
  const bull=relevant.filter(n=>n.sentiment==='BULLISH').length,bear=relevant.filter(n=>n.sentiment==='BEARISH').length;
  const critical=relevant.filter(n=>n.impact==='BREAKING').length;
  const score=Math.min(100,critical*30+relevant.length*8+Math.round(risk.score*.25));
  const level:EventReaction['level']=score>=75?'CRITICAL':score>=45?'ELEVATED':'WATCH';
  const direction=bull>bear?'BULLISH':bear>bull?'BEARISH':bull&&bear?'MIXED':'NEUTRAL';
  const reasons=[`${relevant.length} recent high-impact event(s) detected.`,critical?`${critical} breaking event(s) require immediate validation.`:'No breaking event detected.',assets.length?`Affected assets: ${assets.join(', ')}.`:'Asset attribution is limited.'];
  const actions=level==='CRITICAL'?['Pause new directional decisions until the event impact is revalidated.','Recheck market data, liquidity and derivatives context.']:['Revalidate the signal after the next fresh market cycle.','Monitor affected assets for confirmation or reversal.'];
  return{level,urgency:level==='CRITICAL'?'IMMEDIATE':level==='ELEVATED'?'FAST':'NORMAL',affectedAssets:assets,direction,score,reasons,actions,events:relevant.map(n=>({title:n.title,source:n.source,assets:n.assets,impact:n.impact,sentiment:n.sentiment,credibility:n.credibility,ageMs:n.freshnessMs}))};
}
