import type { ChartVisionContext } from './signal';

type VisionResult = ChartVisionContext & {
  available: boolean;
  provider?: string;
  model?: string;
  rawFields?: Record<string, unknown>;
  error?: string;
};

const finite=(v:unknown)=>Number.isFinite(Number(v));
const clamp=(v:number,a=0,b=100)=>Math.max(a,Math.min(b,v));

function parseJson(text:string):any{
  const cleaned=text.trim().replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();
  try{return JSON.parse(cleaned)}catch{}
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1))}catch{}}
  return null;
}

export type ImageTradePlan = {
  available: boolean;
  side: 'LONG'|'SHORT'|'NO TRADE';
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  stopLossPct: number | null;
  takeProfitPcts: number[];
  riskReward: number | null;
  basis: 'IMAGE_VISIBLE_LEVELS'|'INSUFFICIENT_IMAGE_DATA';
  warnings: string[];
};

export function buildImageTradePlan(vision: VisionResult): ImageTradePlan {
  const p=Number(vision.lastVisiblePrice);
  const supports=(vision.support||[]).filter(Number.isFinite).sort((a,b)=>b-a);
  const resistances=(vision.resistance||[]).filter(Number.isFinite).sort((a,b)=>a-b);
  const side=vision.direction==='BULLISH'?'LONG':vision.direction==='BEARISH'?'SHORT':'NO TRADE';
  if(!vision.available || !Number.isFinite(p) || p<=0 || side==='NO TRADE' || vision.visualQuality<50 || vision.confidence<55){
    return {available:false,side:'NO TRADE',entry:null,stopLoss:null,takeProfits:[],stopLossPct:null,takeProfitPcts:[],riskReward:null,basis:'INSUFFICIENT_IMAGE_DATA',warnings:['Image evidence is insufficient for a numeric trade plan. Live DRO analysis remains the decision authority.']};
  }
  const warnings:string[]=[]; let sl:number|null=null; let tps:number[]=[];
  if(side==='LONG'){
    const s=supports.find(x=>x<p*0.999);
    const r=resistances.filter(x=>x>p*1.001).slice(0,3);
    if(s) sl=s-(p-s)*0.08;
    tps=r.length?r:[p*1.01,p*1.02,p*1.03];
  } else {
    const r=resistances.find(x=>x>p*1.001);
    const s=resistances.length?supports.filter(x=>x<p*0.999).slice(0,3):[];
    if(r) sl=r+(r-p)*0.08;
    tps=s.length?s:[p*0.99,p*0.98,p*0.97];
  }
  if(sl===null){warnings.push('No readable structural stop level was found; image-only SL is not confirmed.'); return {available:false,side,entry:p,stopLoss:null,takeProfits:tps,stopLossPct:null,takeProfitPcts:tps.map(x=>side==='LONG'?(x/p-1)*100:(1-x/p)*100),riskReward:null,basis:'INSUFFICIENT_IMAGE_DATA',warnings};}
  const stopPct=side==='LONG'?(sl/p-1)*100:(1-sl/p)*100;
  const tpp=tps.map(x=>side==='LONG'?(x/p-1)*100:(1-x/p)*100);
  const risk=Math.abs(p-sl); const rr=tps.length?Math.abs(tps[0]-p)/risk:null;
  return {available:true,side,entry:p,stopLoss:sl,takeProfits:tps,stopLossPct:stopPct,takeProfitPcts:tpp,riskReward:rr,basis:'IMAGE_VISIBLE_LEVELS',warnings};
}

export async function analyzeChartImage(imageData:string,liveContext:unknown):Promise<VisionResult>{
  const endpoint=(process.env.DRO_VISION_ENDPOINT||'https://api.openai.com/v1/chat/completions').replace(/\/$/,'');
  const key=process.env.DRO_VISION_API_KEY||process.env.OPENAI_API_KEY||'';
  const model=process.env.DRO_VISION_MODEL||process.env.OPENAI_VISION_MODEL||'gpt-4o-mini';
  if(!key)return {available:false,direction:'UNKNOWN',confidence:0,visualQuality:0,uncertainty:['No server-side vision provider is configured. Image bytes were received but semantic visual extraction cannot be truthfully claimed.'],error:'VISION_PROVIDER_NOT_CONFIGURED'};

  const system=`You are the chart-vision evidence extractor for FLI/DRO. Inspect ONLY what is actually visible in the uploaded image. Do not invent unreadable values. Extract every useful chart fact: symbol, timeframe, current/last visible price, price scale, candle structure, trend, market structure, swing highs/lows, support/resistance, breakouts/fakeouts, liquidity sweeps, gaps, visible volume/order-flow overlays, indicators and their visible values, divergences, chart patterns, annotations, and visual quality. Distinguish observed facts from inference. Return STRICT JSON only with keys: symbol,timeframe,lastVisiblePrice,direction,confidence,visualQuality,trend,marketStructure,support,resistance,patterns,liquidity,volumeContext,indicatorContext,invalidation,evidence,uncertainty,observations. direction must be BULLISH/BEARISH/NEUTRAL/UNKNOWN. support/resistance are arrays of numbers only when readable. confidence and visualQuality 0-100. Never fabricate hidden values.`;

  const userPayload={liveContext,task:'Extract a complete visual evidence packet from THIS chart. Cross-check only as a consistency aid; live context is not permission to invent image facts.',image:imageData};
  try{
    const r=await fetch(endpoint+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:[{type:'text',text:JSON.stringify(userPayload)},{type:'image_url',image_url:{url:imageData,detail:'high'}}]}],temperature:0,max_tokens:2400}),cache:'no-store'});
    if(!r.ok){const t=await r.text().catch(()=> '');throw new Error(`Vision provider ${r.status}: ${t.slice(0,300)}`)}
    const j:any=await r.json();
    const text=typeof j?.choices?.[0]?.message?.content==='string'?j.choices[0].message.content:'';
    const x=parseJson(text);
    if(!x)throw new Error('Vision provider returned non-JSON output');
    const direction=['BULLISH','BEARISH','NEUTRAL','UNKNOWN'].includes(String(x.direction).toUpperCase())?String(x.direction).toUpperCase() as VisionResult['direction']:'UNKNOWN';
    const uncertainty=Array.isArray(x.uncertainty)?x.uncertainty.map(String).slice(0,20):[];
    const evidence=Array.isArray(x.evidence)?x.evidence.map(String).slice(0,30):[];
    const patterns=Array.isArray(x.patterns)?x.patterns.map(String).slice(0,20):[];
    const support=Array.isArray(x.support)?x.support.filter(finite).map(Number).slice(0,20):[];
    const resistance=Array.isArray(x.resistance)?x.resistance.filter(finite).map(Number).slice(0,20):[];
    const confidence=finite(x.confidence)?clamp(Number(x.confidence)):0;
    const visualQuality=finite(x.visualQuality)?clamp(Number(x.visualQuality)):0;
    return {available:true,provider:endpoint,model,symbol:x.symbol?String(x.symbol):null,timeframe:x.timeframe?String(x.timeframe):null,lastVisiblePrice:finite(x.lastVisiblePrice)?Number(x.lastVisiblePrice):null,direction,confidence,visualQuality,trend:x.trend?String(x.trend):undefined,support,resistance,patterns,invalidation:x.invalidation?String(x.invalidation):null,evidence,timeframe:x.timeframe?String(x.timeframe):null,marketStructure:x.marketStructure?String(x.marketStructure):null,liquidity:x.liquidity?String(x.liquidity):null,volumeContext:x.volumeContext?String(x.volumeContext):null,indicatorContext:x.indicatorContext?String(x.indicatorContext):null,uncertainty,rawFields:{symbol:x.symbol,timeframe:x.timeframe,lastVisiblePrice:x.lastVisiblePrice,observations:x.observations}};
  }catch(e){
    return {available:false,direction:'UNKNOWN',confidence:0,visualQuality:0,uncertainty:[e instanceof Error?e.message:'Vision analysis failed'],error:'VISION_ANALYSIS_FAILED'};
  }
}
