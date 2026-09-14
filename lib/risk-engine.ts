import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';
import type { SignalResult } from './signal';

export type RiskSnapshot = {
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME' | 'BLOCKED';
  score: number;
  positionRisk: 'NORMAL' | 'REDUCED' | 'AVOID';
  reasons: string[];
  controls: string[];
  volatility: string;
  liquidity: string;
  derivatives: string;
};

const finite=(v:number|null|undefined):v is number=>v!==null&&v!==undefined&&Number.isFinite(v);
const clamp=(v:number)=>Math.max(0,Math.min(100,Math.round(v)));

export function assessRisk(data:AdvancedMarketData,technical:TechnicalAnalysis,signal:SignalResult):RiskSnapshot{
  let score=0; const reasons:string[]=[]; const controls:string[]=[];
  const volatility=technical.volatility.regime;
  const imbalance=technical.liquidity.imbalance;
  const funding=data.futures.fundingRate;
  const sourceDown=Object.values(data.sourceHealth).filter(v=>v==='down').length;
  if(volatility==='HIGH'){score+=30;reasons.push('High volatility raises stop-out and gap risk.');controls.push('Reduce exposure and widen decision thresholds.');}
  if(volatility==='EXTREME'){score+=25;reasons.push('Extreme volatility makes normal risk assumptions unreliable.');controls.push('Avoid directional exposure until volatility normalizes.');}
  if(finite(imbalance)&&Math.abs(imbalance)>0.35){score+=15;reasons.push('Order-book imbalance is unusually large.');controls.push('Require confirmation; liquidity can shift quickly.');}
  if(finite(funding)&&Math.abs(funding)>0.001){score+=12;reasons.push('Funding is elevated in absolute terms.');controls.push('Account for crowded derivatives positioning.');}
  if(sourceDown>0){score+=20;reasons.push(`${sourceDown} market source(s) are unavailable.`);controls.push('Do not rely on incomplete market coverage.');}
  if(!signal.dataFresh){score+=30;reasons.push('Signal market data is stale.');controls.push('Block new directional decisions until fresh data arrives.');}
  if(signal.signal==='NO TRADE')score+=10;
  const level:RiskSnapshot['level']=!signal.dataFresh||sourceDown>=2?'BLOCKED':score>=75?'EXTREME':score>=50?'HIGH':score>=25?'MODERATE':'LOW';
  const positionRisk=level==='BLOCKED'||level==='EXTREME'?'AVOID':level==='HIGH'?'REDUCED':'NORMAL';
  return{level,score:clamp(score),positionRisk,reasons,controls,volatility,liquidity:finite(imbalance)?`imbalance ${imbalance.toFixed(2)}`:'unknown',derivatives:finite(funding)?`funding ${funding.toFixed(6)}`:'unavailable'};
}
