import type { Candle } from './market-advanced';

export type ChartPatternSnapshot = {
  candleCount: number; lastClose: number | null; bodyPercent: number | null; rangePercent: number | null;
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
  pattern: 'BULLISH_ENGULFING' | 'BEARISH_ENGULFING' | 'HAMMER' | 'SHOOTING_STAR' | 'DOJI' | 'NONE' | 'UNKNOWN';
  breakout: 'UP' | 'DOWN' | 'NONE' | 'UNKNOWN'; confidence: number; warnings: string[];
};
const finite=(v:number|undefined|null):v is number=>v!==undefined&&v!==null&&Number.isFinite(v);
export function analyzeChartPatterns(input:Candle[]):ChartPatternSnapshot{
  const c=input.filter(x=>finite(x.open)&&finite(x.high)&&finite(x.low)&&finite(x.close)&&x.high>=x.low&&x.close>0).sort((a,b)=>a.openTime-b.openTime); const warnings:string[]=[];
  if(c.length<5)return{candleCount:c.length,lastClose:null,bodyPercent:null,rangePercent:null,momentum:'UNKNOWN',pattern:'UNKNOWN',breakout:'UNKNOWN',confidence:0,warnings:['At least 5 validated candles are required for chart-pattern analysis.']};
  const last=c[c.length-1],prev=c[c.length-2],range=last.high-last.low,body=Math.abs(last.close-last.open); const bodyPercent=last.open?body/last.open*100:null,rangePercent=last.open?range/last.open*100:null;
  const bullish=last.close>last.open,bearish=last.close<last.open,prevBull=prev.close>prev.open,prevBear=prev.close<prev.open; let pattern:ChartPatternSnapshot['pattern']='NONE';
  if(prevBear&&bullish&&last.open<=prev.close&&last.close>=prev.open)pattern='BULLISH_ENGULFING'; else if(prevBull&&bearish&&last.open>=prev.close&&last.close<=prev.open)pattern='BEARISH_ENGULFING'; else if(range>0&&body/range<0.12)pattern='DOJI'; else if(range>0){const lower=Math.min(last.open,last.close)-last.low,upper=last.high-Math.max(last.open,last.close);if(lower>=body*2&&upper<=body*.75)pattern='HAMMER';else if(upper>=body*2&&lower<=body*.75)pattern='SHOOTING_STAR';}
  const lookback=c.slice(-6,-1),resistance=lookback.length?Math.max(...lookback.map(x=>x.high)):null,support=lookback.length?Math.min(...lookback.map(x=>x.low)):null; const breakout:ChartPatternSnapshot['breakout']=last.close>=(resistance??Infinity)?'UP':last.close<=(support??-Infinity)?'DOWN':'NONE';
  const closes=c.slice(-5).map(x=>x.close),first=closes[0],delta=first?((closes[closes.length-1]-first)/first*100):0; const momentum:ChartPatternSnapshot['momentum']=delta>.35?'BULLISH':delta<-.35?'BEARISH':'NEUTRAL';
  const confidence=Math.min(100,Math.round((c.length>=20?50:25)+(pattern!=='NONE'?25:0)+(breakout!=='NONE'?15:0)+(momentum!=='NEUTRAL'&&momentum!=='UNKNOWN'?10:0))); if(pattern!=='NONE'&&c.length<20)warnings.push('Pattern detected on a short candle sample; treat as lower-confidence context.');
  return{candleCount:c.length,lastClose:last.close,bodyPercent,rangePercent,momentum,pattern,breakout,confidence,warnings};
}
