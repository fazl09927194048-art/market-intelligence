import { persistForecastEvaluation } from './persistent-memory';

export type ForecastEvaluation={id:string;symbol:string;forecastAt:string;evaluatedAt:string;horizonMs:number;bias:'BULLISH'|'BEARISH'|'NEUTRAL'|'UNAVAILABLE';outcome:'WIN'|'LOSS'|'NEUTRAL'|'INVALIDATED'|'PENDING';startPrice:number;endPrice:number;returnPct:number;directionCorrect:boolean|null;errorPct:number;confidence:number;calibrationGap:number|null};
type PathCandle={openTime:number;high:number;low:number;closeTime:number};
const finite=(v:number|null|undefined):v is number=>v!==null&&v!==undefined&&Number.isFinite(v);

export function evaluateForecast(input:{id?:string;symbol:string;forecastAt:string;bias:'BULLISH'|'BEARISH'|'NEUTRAL'|'UNAVAILABLE';confidence:number;startPrice:number;endPrice:number;expectedLow:number|null;expectedHigh:number|null;horizonMs:number;path?:PathCandle[];now?:string}):ForecastEvaluation{
  const start=Number(input.startPrice),end=Number(input.endPrice),horizonMs=Number(input.horizonMs);
  if(!Number.isFinite(start)||start<=0)throw new Error('Invalid forecast start price');
  if(!Number.isFinite(end)||end<=0)throw new Error('Invalid forecast end price');
  if(!Number.isFinite(horizonMs)||horizonMs<=0)throw new Error('Invalid forecast horizon');
  const forecastAtMs=Date.parse(input.forecastAt);
  if(!Number.isFinite(forecastAtMs))throw new Error('Invalid forecast timestamp');
  const ret=(end-start)/start*100;
  const highDistance=finite(input.expectedHigh)?Math.abs(input.expectedHigh-start)/start*100:0;
  const threshold=Math.max(0.05,Math.min(1,highDistance*0.15));
  const directionCorrect=input.bias==='BULLISH'?ret>threshold:input.bias==='BEARISH'?ret<-threshold:null;
  const inRange=finite(input.expectedLow)&&finite(input.expectedHigh)?end>=input.expectedLow&&end<=input.expectedHigh:true;

  let pathOutcome:'WIN'|'LOSS'|'NEUTRAL'|null=null;
  if(input.path?.length&&finite(input.expectedLow)&&finite(input.expectedHigh)){
    const candles=input.path.filter(c=>Number.isFinite(c.openTime)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&c.high>=c.low).sort((a,b)=>a.openTime-b.openTime);
    for(const c of candles){
      const hitHigh=c.high>=input.expectedHigh;
      const hitLow=c.low<=input.expectedLow;
      if(hitHigh&&hitLow){pathOutcome='NEUTRAL';break;}
      if(hitHigh){pathOutcome=input.bias==='BULLISH'?'WIN':'LOSS';break;}
      if(hitLow){pathOutcome=input.bias==='BEARISH'?'WIN':'LOSS';break;}
    }
  }
  const outcome=input.bias==='UNAVAILABLE'?'INVALIDATED':pathOutcome??(directionCorrect===true?'WIN':directionCorrect===false?'LOSS':inRange?'NEUTRAL':'INVALIDATED');
  const errorPct=finite(input.expectedLow)&&finite(input.expectedHigh)?Math.max(0,end>input.expectedHigh?((end-input.expectedHigh)/start*100):end<input.expectedLow?((input.expectedLow-end)/start*100):0):0;
  const confidence=Math.max(0,Math.min(100,Number(input.confidence)||0));
  const calibrationGap=directionCorrect===null?null:Math.round((directionCorrect?100:0)-confidence);
  return{id:input.id??`forecast-${input.symbol}-${forecastAtMs}-${horizonMs}`,symbol:input.symbol,forecastAt:new Date(forecastAtMs).toISOString(),evaluatedAt:input.now??new Date().toISOString(),horizonMs,bias:input.bias,outcome,startPrice:start,endPrice:end,returnPct:Number(ret.toFixed(6)),directionCorrect,errorPct:Number(errorPct.toFixed(6)),confidence,calibrationGap};
}

export async function recordForecastEvaluation(evaluation:ForecastEvaluation){return persistForecastEvaluation(evaluation);}
