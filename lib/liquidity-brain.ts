import type { AdvancedMarketData, OrderBookLevel } from './market-advanced';

export type LiquidityBrain={score:number;bias:'BUY'|'SELL'|'NEUTRAL';imbalance:number|null;weightedImbalance:number|null;spreadPct:number|null;bidDepthNotional:number;askDepthNotional:number;depthRatio:number|null;buyPressure:number;sellPressure:number;deltaRatio:number;liquidationPressure:number;walls:{side:'BID'|'ASK';price:number;notional:number;distancePct:number}[];absorptionRisk:number;spoofRisk:number;confidence:number;warnings:string[];method:string};
const clamp=(n:number,a:number=0,b:number=100)=>Math.max(a,Math.min(b,n));
const sumDepth=(levels:OrderBookLevel[],reference:number|null,maxDistancePct=1.5)=>{if(!reference||reference<=0)return{notional:0,weighted:0};return levels.reduce((x,l)=>{const d=Math.abs(l.price-reference)/reference*100;if(d>maxDistancePct)return x;const w=Math.max(0,1-d/maxDistancePct),notional=l.price*l.quantity;return{notional:x.notional+notional,weighted:x.weighted+notional*w};},{notional:0,weighted:0});};
export function analyzeLiquidityBrain(data:AdvancedMarketData):LiquidityBrain{
 const price=data.futures.price??data.spot.price,bids=data.spot.orderBook.bids,asks=data.spot.orderBook.asks;
 const bid=sumDepth(bids,price),ask=sumDepth(asks,price),total=bid.weighted+ask.weighted;
 const weightedImbalance=total>0?(bid.weighted-ask.weighted)/total:null,rawImbalance=data.microstructure.orderBookImbalance;
 const depthRatio=ask.weighted>0?bid.weighted/ask.weighted:null,flowTotal=data.microstructure.buyNotional+data.microstructure.sellNotional;
 const deltaRatio=flowTotal>0?data.microstructure.deltaNotional/flowTotal:0,liqTotal=data.microstructure.liquidationBuyNotional+data.microstructure.liquidationSellNotional;
 const liquidationPressure=liqTotal>0?data.microstructure.liquidationNetNotional/liqTotal:0;
 const buyPressure=clamp(50+deltaRatio*50),sellPressure=clamp(50-deltaRatio*50);
 const walls=[...bids.map(x=>({side:'BID' as const,price:x.price,notional:x.price*x.quantity,distancePct:price?Math.abs(x.price-price)/price*100:999}),...asks.map(x=>({side:'ASK' as const,price:x.price,notional:x.price*x.quantity,distancePct:price?Math.abs(x.price-price)/price*100:999}))].filter(x=>x.distancePct<=2).sort((a,b)=>b.notional-a.notional).slice(0,6);
 const medianWall=walls.length?walls.reduce((s,x)=>s+x.notional,0)/walls.length:0,spoofRisk=medianWall>0?clamp(walls.filter(x=>x.notional>medianWall*3).length*18):0;
 const absorptionRisk=clamp(Math.abs(deltaRatio)*35+(walls.length>=3?15:0)+(Math.abs(liquidationPressure)>0.35?20:0));
 const score=clamp(50+(weightedImbalance??rawImbalance??0)*28+deltaRatio*28+liquidationPressure*12-(data.microstructure.spreadPct??0)*8);
 const bias=score>=58?'BUY':score<=42?'SELL':'NEUTRAL',confidence=clamp(40+Math.abs(score-50)*1.1+(bid.notional+ask.notional>0?12:0)-spoofRisk*.25),warnings:string[]=[];
 if(!price||!bids.length||!asks.length)warnings.push('Order-book depth is incomplete; liquidity conclusion is degraded.');
 if((data.microstructure.spreadPct??0)>0.08)warnings.push('Wide spread detected; execution quality may be degraded.');
 if(spoofRisk>=36)warnings.push('Large near-price liquidity walls detected; persistence is unverified until refreshed.');
 if(absorptionRisk>=60)warnings.push('Strong flow/liquidation pressure may be encountering opposing liquidity.');
 return{score:Math.round(score),bias,imbalance:rawImbalance,weightedImbalance,spreadPct:data.microstructure.spreadPct,bidDepthNotional:Math.round(bid.notional),askDepthNotional:Math.round(ask.notional),depthRatio:depthRatio?Number(depthRatio.toFixed(3)):null,buyPressure:Math.round(buyPressure),sellPressure:Math.round(sellPressure),deltaRatio:Number(deltaRatio.toFixed(4)),liquidationPressure:Number(liquidationPressure.toFixed(4)),walls,absorptionRisk:Math.round(absorptionRisk),spoofRisk:Math.round(spoofRisk),confidence:Math.round(confidence),warnings,method:'Near-price weighted order-book depth + aggressive trade flow + liquidation pressure + spread; walls are observations, not proof of intent.'};
}