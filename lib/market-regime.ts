export type MarketRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'BREAKOUT'
  | 'REVERSAL'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNCERTAIN';

export type MarketRegimeSnapshot = {
  regime: MarketRegime;
  confidence: number;
  trend: 'UP'|'DOWN'|'SIDEWAYS';
  volatility: 'HIGH'|'NORMAL'|'LOW';
  features: {
    trendStrength: number;
    volatilityScore: number;
    momentum: number;
    volumeExpansion: number;
    breakout: boolean;
    reversalRisk: number;
  };
  reasons: string[];
};

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};

export function detectMarketRegime(data:any, technical:any): MarketRegimeSnapshot {
  const candles=Array.isArray(data?.futures?.candles)&&data.futures.candles.length?data.futures.candles:(Array.isArray(data?.spot?.candles)?data.spot.candles:[]);
  const last=candles.at(-1), prev=candles.at(-2);
  const price=num(data?.futures?.price??data?.spot?.price??last?.close)??0;
  const rsi=num(technical?.indicators?.rsi14)??50;
  const ema20=num(technical?.indicators?.ema20), ema50=num(technical?.indicators?.ema50);
  const macd=num(technical?.indicators?.macd), macdSignal=num(technical?.indicators?.macdSignal);
  const trend=technical?.structure?.trend==='UP'?'UP':technical?.structure?.trend==='DOWN'?'DOWN':'SIDEWAYS';
  const atr=num(technical?.indicators?.atr14);
  const atrPct=atr&&price>0?Math.abs(atr/price)*100:0;
  const volRegime=technical?.volatility?.regime==='HIGH'?'HIGH':technical?.volatility?.regime==='LOW'?'LOW':'NORMAL';
  const volRatio=last&&prev&&Number(prev.volume)>0?Number(last.volume)/Number(prev.volume):1;
  const trendStrength=clamp(Math.abs((ema20&&ema50&&ema50!==0)?((ema20-ema50)/ema50)*100:0)*12,0,100);
  const momentum=clamp(Math.abs(rsi-50)*2,0,100);
  const volumeExpansion=clamp((volRatio-0.8)*125,0,100);
  const volatilityScore=clamp(volRegime==='HIGH'?85:volRegime==='LOW'?20:atrPct*25,0,100);
  const upper=num(technical?.indicators?.bollingerUpper), lower=num(technical?.indicators?.bollingerLower);
  const breakout=Boolean(last&&upper&&lower&&((last.close>upper)||(last.close<lower))&&volRatio>=1.2);
  const reversalRisk=clamp((rsi>=72||rsi<=28?55:0)+(macd!==null&&macdSignal!==null&&((trend==='UP'&&macd<macdSignal)||(trend==='DOWN'&&macd>macdSignal))?35:0)+(volRatio>1.8?10:0),0,100);
  const reasons:string[]=[];
  let regime:MarketRegime='UNCERTAIN';
  if(breakout){regime='BREAKOUT';reasons.push('Price escaped the Bollinger range with volume expansion.');}
  else if(reversalRisk>=70){regime='REVERSAL';reasons.push('Momentum exhaustion and opposing momentum evidence are elevated.');}
  else if(volRegime==='HIGH'||volatilityScore>=75){regime='HIGH_VOLATILITY';reasons.push('Volatility is elevated relative to the detected baseline.');}
  else if(volRegime==='LOW'||volatilityScore<=25){regime='LOW_VOLATILITY';reasons.push('Volatility is compressed.');}
  else if(trend==='UP'&&trendStrength>=35){regime='TREND_UP';reasons.push('Directional trend and moving-average structure are aligned upward.');}
  else if(trend==='DOWN'&&trendStrength>=35){regime='TREND_DOWN';reasons.push('Directional trend and moving-average structure are aligned downward.');}
  else {regime='RANGE';reasons.push('Trend strength is weak and price structure is not directional.');}
  if(momentum>=60)reasons.push('Momentum is extended.');
  if(volumeExpansion>=65)reasons.push('Recent volume is expanding.');
  const confidence=clamp(Math.round(45+Math.max(trendStrength,momentum,volatilityScore)*0.35+(breakout?15:0)-Math.max(0,50-trendStrength)*0.08),35,95);
  return {regime,confidence,trend,volatility:volRegime,features:{trendStrength,volatilityScore,momentum,volumeExpansion,breakout,reversalRisk},reasons};
}
