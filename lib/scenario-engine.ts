import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';
import type { SignalResult, ForecastResult } from './signal';

export type Scenario = { id:'bull'|'base'|'bear'; label:string; probability:number; trigger:string; target:number|null; invalidation:string; evidence:string[] };
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/**
 * Scenario engine v2:
 * combines structure, signal, forecast, volatility, order-flow, derivatives positioning,
 * liquidation pressure and momentum divergence. Probabilities remain model-weighted
 * scenario estimates, not calibrated win probabilities.
 */
export function buildScenarios(data:AdvancedMarketData,t:TechnicalAnalysis,signal:SignalResult,forecast:ForecastResult){
 const price=data.futures.price??data.spot.price, atr=t.indicators.atr14??0, trend=t.structure.trend;
 const flow=data.microstructure.deltaNotional;
 const flowTotal=data.microstructure.buyNotional+data.microstructure.sellNotional;
 const flowRatio=flowTotal>0?flow/flowTotal:null;
 const imbalance=data.microstructure.orderBookImbalance;
 const funding=data.futures.fundingRate;
 const basis=data.derivatives.basisPct;
 const liqNet=data.microstructure.liquidationNetNotional;
 const liqTotal=data.microstructure.liquidationBuyNotional+data.microstructure.liquidationSellNotional;
 const liqRatio=liqTotal>0?liqNet/liqTotal:null;

 let bull=33,bear=33,base=34;
 const bullEvidence:string[]=['Bull case requires confirmation; probability is model-weighted.'];
 const bearEvidence:string[]=['Bear case remains available if bullish assumptions fail.'];
 const baseEvidence:string[]=['Neutral case absorbs conflicting or low-quality evidence.'];

 if(trend==='UP'){bull+=14;bear-=7;base-=7;bullEvidence.push('Higher-timeframe structure is UP.');}
 else if(trend==='DOWN'){bear+=14;bull-=7;base-=7;bearEvidence.push('Structure is DOWN.');}
 else {base+=6;bull-=3;bear-=3;baseEvidence.push('Structure is not directionally aligned.');}

 if(signal.signal==='LONG'){bull+=10;bear-=5;base-=5;bullEvidence.push('Validated signal layer is LONG.');}
 else if(signal.signal==='SHORT'){bear+=10;bull-=5;base-=5;bearEvidence.push('Validated signal layer is SHORT.');}

 if(forecast.bias==='BULLISH'){bull+=8;bear-=4;base-=4;bullEvidence.push('Forecast bias is bullish.');}
 else if(forecast.bias==='BEARISH'){bear+=8;bull-=4;base-=4;bearEvidence.push('Forecast bias is bearish.');}

 if(t.volatility.regime==='HIGH'){base+=6;bull-=3;bear-=3;baseEvidence.push('High volatility increases whipsaw/range risk.');}
 else if(t.volatility.regime==='LOW'){base+=3;bull-=1.5;bear-=1.5;baseEvidence.push('Low volatility reduces breakout conviction.');}

 if(flowRatio!==null){
   if(flowRatio>0.12){bull+=8;bullEvidence.push(`Aggressive trade flow is bid-dominant (${(flowRatio*100).toFixed(1)}%).`);}
   else if(flowRatio<-0.12){bear+=8;bearEvidence.push(`Aggressive trade flow is ask-dominant (${(flowRatio*100).toFixed(1)}%).`);}
   else {base+=2;baseEvidence.push('Trade flow is relatively balanced.');}
 }
 if(imbalance!==null){
   if(imbalance>0.12){bull+=5;bullEvidence.push('Order-book depth favors bids.');}
   else if(imbalance<-0.12){bear+=5;bearEvidence.push('Order-book depth favors asks.');}
 }
 if(funding!==null){
   if(funding>0.001){bear+=3;base+=1;bearEvidence.push('Elevated positive funding adds long-crowding risk.');}
   else if(funding<-0.001){bull+=3;base+=1;bullEvidence.push('Negative funding can indicate short-crowding/rebound pressure.');}
 }
 if(basis!==null){
   if(basis>0.15){bear+=2;bearEvidence.push('Positive futures basis is elevated.');}
   else if(basis<-0.15){bull+=2;bullEvidence.push('Negative futures basis supports a potential squeeze/reversion case.');}
 }
 if(liqRatio!==null && Math.abs(liqRatio)>0.15){
   if(liqRatio>0){bull+=3;bullEvidence.push('Recent liquidation flow is buy-side dominant.');}
   else {bear+=3;bearEvidence.push('Recent liquidation flow is sell-side dominant.');}
 }
 if(t.divergence==='BULLISH'){bull+=5;bear-=2;bullEvidence.push('Momentum divergence is bullish.');}
 else if(t.divergence==='BEARISH'){bear+=5;bull-=2;bearEvidence.push('Momentum divergence is bearish.');}

 const raw=[clamp(bull,5,88),clamp(base,5,88),clamp(bear,5,88)];
 const total=raw.reduce((a,b)=>a+b,0);
 const p=raw.map(x=>Math.round(x/total*100));
 p[1]+=100-p.reduce((a,b)=>a+b,0);

 const scenarios=[
  {id:'bull' as const,label:'Bullish expansion',probability:p[0],trigger:t.structure.resistance!==null?'Acceptance above '+t.structure.resistance.toFixed(2)+' with sustained volume/flow confirmation.':'Fresh higher-high plus positive flow confirmation.',target:price!==null&&atr>0?price+atr*2:null,invalidation:t.structure.support!==null?'Loss of support near '+t.structure.support.toFixed(2)+'.':'Clear bearish structure shift.',evidence:bullEvidence},
  {id:'base' as const,label:'Range / neutral',probability:p[1],trigger:'Price remains between nearby structure levels without decisive flow expansion.',target:price,invalidation:'Confirmed breakout with sustained flow/volume or a structure reversal.',evidence:baseEvidence},
  {id:'bear' as const,label:'Bearish expansion',probability:p[2],trigger:t.structure.support!==null?'Acceptance below '+t.structure.support.toFixed(2)+' with sustained ask pressure.':'Fresh lower-low plus negative flow confirmation.',target:price!==null&&atr>0?price-atr*2:null,invalidation:t.structure.resistance!==null?'Recovery above resistance near '+t.structure.resistance.toFixed(2)+'.':'Clear bullish structure shift.',evidence:bearEvidence}
 ];
 const dominant=scenarios.reduce((a,b)=>b.probability>a.probability?b:a).id;
 const entropy=scenarios.reduce((s,x)=>s-(x.probability/100)*Math.log2(Math.max(x.probability/100,0.0001)),0);
 return {
  method:'Scenario v2: structure + signal + forecast + volatility + order-flow + order-book + funding + basis + liquidation pressure + divergence.',
  scenarios,dominant,
  diagnostics:{flowRatio,orderBookImbalance:imbalance,fundingRate:funding,basisPct:basis,liquidationRatio:liqRatio,entropy:Number(entropy.toFixed(3)),separation:Math.max(...p)-Math.min(...p)},
  calibrationNote:'Probabilities are model-weighted scenario estimates. They are not statistically calibrated win probabilities; higher entropy means the paths are less separated.'
 };
}
