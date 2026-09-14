import { persistForecastEvaluation } from './persistent-memory';

export type ForecastEvaluation={
  id:string; symbol:string; forecastAt:string; evaluatedAt:string; horizonMs:number;
  bias:'BULLISH'|'BEARISH'|'NEUTRAL'|'UNAVAILABLE'; outcome:'WIN'|'LOSS'|'NEUTRAL'|'INVALIDATED'|'PENDING';
  startPrice:number; endPrice:number; returnPct:number; directionCorrect:boolean|null; errorPct:number;
  confidence:number; calibrationGap:number|null;
};

const finite=(v:number|null|undefined):v is number=>v!==null&&v!==undefined&&Number.isFinite(v);

export function evaluateForecast(input:{symbol:string;forecastAt:string;bias:'BULLISH'|'BEARISH'|'NEUTRAL'|'UNAVAILABLE';confidence:number;startPrice:number;endPrice:number;expectedLow:number|null;expectedHigh:number|null;horizonMs:number;now?:string}):ForecastEvaluation{
 const start=input.startPrice,end=input.endPrice,ret=(end-start)/start*100;
 const threshold=Math.max(0.05,Math.min(1,(Math.abs((input.expectedHigh??start)-start)/start)*100*0.15));
 const directionCorrect=input.bias==='BULLISH'?ret>threshold:input.bias==='BEARISH'?ret<-threshold:null;
 const inRange=finite(input.expectedLow)&&finite(input.expectedHigh)?end>=input.expectedLow&&end<=input.expectedHigh:true;
 const outcome=input.bias==='UNAVAILABLE'?'INVALIDATED':directionCorrect===true?'WIN':directionCorrect===false?'LOSS':inRange?'NEUTRAL':'INVALIDATED';
 const errorPct=finite(input.expectedLow)&&finite(input.expectedHigh)?Math.max(0,end>input.expectedHigh?((end-input.expectedHigh)/start*100):end<input.expectedLow?((input.expectedLow-end)/start*100):0):0;
 const calibrationGap=directionCorrect===null?null:Math.round((directionCorrect?100:0)-input.confidence);
 return{id:`forecast-${input.symbol}-${Date.parse(input.forecastAt)}-${input.horizonMs}`,symbol:input.symbol,forecastAt:input.forecastAt,evaluatedAt:input.now??new Date().toISOString(),horizonMs:input.horizonMs,bias:input.bias,outcome,startPrice:start,endPrice:end,returnPct:Number(ret.toFixed(6)),directionCorrect,errorPct:Number(errorPct.toFixed(6)),confidence:input.confidence,calibrationGap};
}

export async function recordForecastEvaluation(evaluation:ForecastEvaluation){return persistForecastEvaluation(evaluation);}
