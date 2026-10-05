export type LearningCandle={timestamp:number;open:number;high:number;low:number;close:number};
export type BacktestRequest={candles:LearningCandle[];signals:Array<{index:number;direction:'LONG'|'SHORT';confidence:number;horizonBars:number}>;feeBps?:number;slippageBps?:number};
export type BacktestResult={trades:number;wins:number;losses:number;winRate:number;totalReturnPct:number;maxDrawdownPct:number;profitFactor:number;avgReturnPct:number;byConfidence:{high:number;medium:number;low:number};};
const pct=(a:number,b:number)=>b?((a-b)/b)*100:0;
export function runBacktest(i:BacktestRequest):BacktestResult{
 const fee=(i.feeBps??10)/100, slip=(i.slippageBps??5)/100; const rows=i.signals.filter(s=>s.index>=0&&s.index<i.candles.length&&s.horizonBars>0&&s.index+s.horizonBars<i.candles.length);
 let equity=100,peak=100,maxDd=0,wins=0,losses=0,sum=0,grossWin=0,grossLoss=0; const buckets={high:0,medium:0,low:0};
 for(const s of rows){const e=i.candles[s.index].close,x=i.candles[s.index+s.horizonBars].close;let r=s.direction==='LONG'?pct(x,e):pct(e,x);r-=fee+slip; equity*=1+r/100; peak=Math.max(peak,equity); maxDd=Math.max(maxDd,(peak-equity)/peak*100);sum+=r;if(r>0){wins++;grossWin+=r}else{losses++;grossLoss+=Math.abs(r)}if(s.confidence>=75)buckets.high++;else if(s.confidence>=55)buckets.medium++;else buckets.low++;}
 return {trades:rows.length,wins,losses,winRate:rows.length?wins/rows.length*100:0,totalReturnPct:equity-100,maxDrawdownPct:maxDd,profitFactor:grossLoss?grossWin/grossLoss:(grossWin?Infinity:0),avgReturnPct:rows.length?sum/rows.length:0,byConfidence:buckets};
}
export function validateLearningResult(r:BacktestResult){return {eligible:r.trades>=30&&r.profitFactor>1&&r.totalReturnPct>0&&r.maxDrawdownPct<20,reason:r.trades<30?'Insufficient sample size':r.profitFactor<=1?'Profit factor is not above 1':r.totalReturnPct<=0?'Return is not positive':r.maxDrawdownPct>=20?'Drawdown exceeds promotion threshold':'Passed evaluation gate'};}
