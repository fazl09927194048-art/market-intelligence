import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';

export type DynamicRiskInput={
 risk:any;
 advanced:AdvancedMarketData;
 technical:TechnicalAnalysis;
 side:'BUY'|'SELL';
 entry:number;
 stop:number;
 takeProfit?:number|null;
 confidence:number;
 dailyRealizedLoss:number;
 openExposure:number;
 symbolExposure:number;
 consecutiveLosses:number;
};
export type DynamicRiskResult={
 allowed:boolean;
 riskBudgetUsd:number;
 recommendedQuantity:number;
 recommendedNotionalUsd:number;
 stopDistancePct:number;
 expectedR:number|null; levelQuality:'GOOD'|'CAUTION'|'BLOCKED';
 riskMultiplier:number;
 reasons:string[];
 blocks:string[];
 factors:{volatility:number;liquidity:number;confidence:number;drawdown:number;exposure:number;concentration:number;lossStreak:number};
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);

export function calculateDynamicRisk(i:DynamicRiskInput):DynamicRiskResult{
 const reasons:string[]=[]; const blocks:string[]=[];
 const entry=Math.abs(i.entry), stop=Math.abs(i.stop);
 const stopDistancePct=entry>0?Math.abs(entry-stop)/entry*100:Infinity;
 const volatility=String(i.technical?.volatility?.regime||'UNKNOWN').toUpperCase();
 const spread=Number(i.advanced?.microstructure?.spreadPct||0);
 const imbalance=Math.abs(Number(i.advanced?.microstructure?.orderBookImbalance||0));
 const sourceDown=Object.values(i.advanced?.sourceHealth||{}).filter(v=>v==='down').length;
 const liquidityConfidence=Number((i.advanced as any)?.microstructure?.liquidityConfidence ?? (i.advanced as any)?.liquidityBrain?.confidence ?? 100);
 const rawFetchedAt=(i.advanced as any)?.fetchedAt; const staleAt=typeof rawFetchedAt==='number'?rawFetchedAt:Date.parse(String(rawFetchedAt||'')); const dataAgeMs=Number.isFinite(staleAt)&&staleAt>0?Math.max(0,Date.now()-staleAt):Infinity;
 const confidence=clamp(Number(i.confidence)||0,0,100);
 const maxDaily=Number(i.risk.max_daily_loss_usd||0);
 const maxPosition=Number(i.risk.max_position_usd||0);
 const maxOrder=Number(i.risk.max_order_usd||0);
 const dailyLoss=Math.max(0,Number(i.dailyRealizedLoss)||0);
 const exposure=Math.max(0,Number(i.openExposure)||0);
 const symbolExposure=Math.max(0,Number(i.symbolExposure)||0);
 const consecutiveLosses=Math.max(0,Math.floor(Number(i.consecutiveLosses)||0));
 const remainingDaily=Math.max(0,maxDaily-dailyLoss);
 if(!finite(entry)||entry<=0||!finite(stop)||stop<=0||stopDistancePct<=0) blocks.push('Invalid entry/stop distance.');
 if(stopDistancePct>20) blocks.push('Stop distance is too wide for controlled position sizing.');
 if(sourceDown>0) blocks.push('One or more market sources are unavailable.');
 if(Number.isFinite(liquidityConfidence)&&liquidityConfidence<35) blocks.push('Liquidity confidence is too low for controlled execution.');
 if(dataAgeMs>90000) blocks.push('Market data is stale for risk-controlled execution.');
 if(String(i.advanced?.sourceHealth?.spot||'').toLowerCase()==='down'||String(i.advanced?.sourceHealth?.futures||'').toLowerCase()==='down') blocks.push('Critical spot/futures market data is unavailable.');
 if(remainingDaily<=0) blocks.push('Daily loss budget is exhausted.');
 if(maxPosition<=0||maxOrder<=0) blocks.push('Configured position/order risk limits are invalid.');
 const volMult=volatility==='EXTREME'?0.35:volatility==='HIGH'?0.55:volatility==='LOW'?1.05:0.85;
 const liqMult=clamp(1-imbalance*0.55,0.45,1); const spreadMult=clamp(1-spread*8,0.5,1);
 const confMult=clamp(0.55+confidence/200,0.55,1.05);
 const drawdownMult=clamp(1-dailyLoss/Math.max(maxDaily,1),0.1,1);
 const exposureMult=clamp(1-exposure/Math.max(maxPosition,1),0.1,1);
 const concentrationMult=clamp(1-symbolExposure/Math.max(maxPosition,1),0.15,1);
 const streakMult=consecutiveLosses>=5?0.1:consecutiveLosses>=4?0.35:consecutiveLosses>=3?0.55:consecutiveLosses>=2?0.75:1;
 const riskMultiplier=clamp(volMult*liqMult*spreadMult*confMult*drawdownMult*exposureMult*concentrationMult*streakMult,0.05,1);
 const baseRisk=Math.min(remainingDaily*0.25,maxDaily*0.02);
 const riskBudgetUsd=Math.max(0,baseRisk*riskMultiplier);
 const recommendedQuantity=entry>0?riskBudgetUsd/Math.abs(entry-stop):0;
 const recommendedNotionalUsd=Math.min(maxPosition,Math.min(maxOrder,recommendedQuantity*entry));
 const expectedR=finite(i.takeProfit)&&i.takeProfit!>0?Math.abs(i.takeProfit-entry)/Math.abs(entry-stop):null;
 const atrPct=Number(i.technical?.volatility?.atrPercent);
 const atrDistancePct=Number.isFinite(atrPct)&&atrPct>0?atrPct:null;
 const minStopPct=atrDistancePct!==null?Math.max(0.15,atrDistancePct*0.65):0.15;
 const maxStopPct=atrDistancePct!==null?Math.min(12,Math.max(2.5,atrDistancePct*3.5)):12;
 let levelQuality:'GOOD'|'CAUTION'|'BLOCKED'='GOOD';
 if(stopDistancePct<minStopPct){ levelQuality='CAUTION'; reasons.push('Stop distance is tighter than the current ATR-based safety floor.'); }
 if(stopDistancePct>maxStopPct){ levelQuality='BLOCKED'; blocks.push('Stop distance exceeds the ATR/regime risk ceiling.'); }
 if(i.side==='BUY'&&finite(i.technical?.structure?.support)&&stop>=Number(i.technical.structure.support)){ reasons.push('Long stop is not below the latest structural support.'); levelQuality=levelQuality==='GOOD'?'CAUTION':levelQuality; }
 if(i.side==='SELL'&&finite(i.technical?.structure?.resistance)&&stop<=Number(i.technical.structure.resistance)){ reasons.push('Short stop is not above the latest structural resistance.'); levelQuality=levelQuality==='GOOD'?'CAUTION':levelQuality; }
 if(volatility==='EXTREME') reasons.push('Extreme volatility reduced risk budget.');
 else if(volatility==='HIGH') reasons.push('High volatility reduced position size.');
 if(imbalance>0.35) reasons.push('Order-book imbalance reduced exposure.');
 if(spread>0.08) reasons.push('Wide spread reduced exposure.');
 if(Number.isFinite(liquidityConfidence)&&liquidityConfidence<60) reasons.push('Low liquidity confidence reduced exposure.');
 if(dataAgeMs>30000) reasons.push('Market data age reduced execution confidence.');
 if(confidence<70) reasons.push('Confidence below 70% reduced exposure.');
 if(dailyLoss>0) reasons.push('Existing daily loss reduced remaining risk budget.');
 if(exposure>0) reasons.push('Existing exposure reduced new position size.');
 if(symbolExposure>0) reasons.push('Existing symbol concentration reduced new position size.');
 if(consecutiveLosses>=3) reasons.push('Consecutive losses reduced the next risk budget.');
 if(consecutiveLosses>=5) blocks.push('Risk engine is in loss-streak lockout after five consecutive losses.');
 if(expectedR!==null&&expectedR<1.5) blocks.push('Risk/reward is below the 1.5R minimum.');
 if(riskMultiplier<0.15) blocks.push('Dynamic risk multiplier is below the safety floor.');
 return {allowed:blocks.length===0&&recommendedNotionalUsd>0,riskBudgetUsd,recommendedQuantity,recommendedNotionalUsd,stopDistancePct,expectedR,riskMultiplier,levelQuality,factors:{volatility:volMult,liquidity:liqMult,confidence:confMult,drawdown:drawdownMult,exposure:exposureMult,concentration:concentrationMult,lossStreak:streakMult},reasons,blocks};
}
