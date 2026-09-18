import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';
import type { SignalResult, ForecastResult } from './signal';

export type Scenario = { id:'bull'|'base'|'bear'; label:string; probability:number; trigger:string; target:number|null; invalidation:string; evidence:string[] };
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function buildScenarios(data:AdvancedMarketData,t:TechnicalAnalysis,signal:SignalResult,forecast:ForecastResult){
 const price=data.futures.price??data.spot.price, atr=t.indicators.atr14??0, trend=t.structure.trend;
 let bull=33,bear=33,base=34;
 if(trend==='UP'){bull+=16;bear-=8;base-=8}else if(trend==='DOWN'){bear+=16;bull-=8;base-=8}
 if(signal.signal==='LONG'){bull+=12;bear-=7;base-=5}else if(signal.signal==='SHORT'){bear+=12;bull-=7;base-=5}
 if(forecast.bias==='BULLISH'){bull+=9;bear-=5;base-=4}else if(forecast.bias==='BEARISH'){bear+=9;bull-=5;base-=4}
 if(t.volatility.regime==='HIGH'){base+=7;bull-=3;bear-=4}
 const raw=[clamp(bull,5,85),clamp(base,5,85),clamp(bear,5,85)],total=raw.reduce((a,b)=>a+b,0),p=raw.map(x=>Math.round(x/total*100));p[1]+=100-p.reduce((a,b)=>a+b,0);
 const scenarios=[
  {id:'bull',label:'Bullish expansion',probability:p[0],trigger:t.structure.resistance!==null?'Confirmed acceptance above '+t.structure.resistance.toFixed(2)+' with volume/flow confirmation.':'Fresh higher-high confirmation with positive flow.',target:price!==null&&atr>0?price+atr*2:null,invalidation:t.structure.support!==null?'Loss of support near '+t.structure.support.toFixed(2)+'.':'Clear bearish structure shift.',evidence:['Trend and directional signal are bullish inputs.','Requires confirmation; probability is model-weighted, not a guarantee.']},
  {id:'base',label:'Range / neutral',probability:p[1],trigger:'Price remains between nearby structure levels without decisive flow expansion.',target:price,invalidation:'Confirmed breakout with sustained volume or a structure reversal.',evidence:['Neutral outcomes absorb conflicting specialist views.','High volatility increases the chance of non-directional whipsaw.']},
  {id:'bear',label:'Bearish expansion',probability:p[2],trigger:t.structure.support!==null?'Confirmed acceptance below '+t.structure.support.toFixed(2)+' with ask pressure.':'Fresh lower-low confirmation with negative flow.',target:price!==null&&atr>0?price-atr*2:null,invalidation:t.structure.resistance!==null?'Recovery above resistance near '+t.structure.resistance.toFixed(2)+'.':'Clear bullish structure shift.',evidence:['Bearish case remains available when technical assumptions fail.','News/liquidity shocks can invalidate this scenario.']}
 ];
 const dominant=scenarios.reduce((a,b)=>b.probability>a.probability?b:a).id as 'bull'|'base'|'bear';
 return {method:'Heuristic scenario weighting from structure, signal, forecast, volatility and confirmation requirements.',scenarios,dominant,calibrationNote:'Probabilities are model-weighted scenario estimates. They are not statistically calibrated win probabilities.'};
}
