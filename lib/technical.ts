import type { Candle, OrderBookLevel } from './market-advanced';

export type TechnicalAnalysis = {
  indicators: {
    ema20: number | null; ema50: number | null; sma20: number | null;
    rsi14: number | null; macd: number | null; macdSignal: number | null;
    bollingerUpper: number | null; bollingerMiddle: number | null; bollingerLower: number | null;
    vwap: number | null; atr14: number | null;
  };
  structure: { trend: 'UP'|'DOWN'|'SIDEWAYS'|'UNKNOWN'; support: number|null; resistance: number|null; higherHighs: boolean; higherLows: boolean };
  volatility: { atrPercent: number|null; realizedPercent: number|null; regime: 'LOW'|'NORMAL'|'HIGH'|'UNKNOWN' };
  liquidity: { bidNotional: number; askNotional: number; imbalance: number|null; spreadPercent: number|null };
  divergence: 'BULLISH'|'BEARISH'|'NONE'|'UNKNOWN';
  confidence: number;
  warnings: string[];
};

const finite = (v: number|null|undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const closes = (c: Candle[]) => c.map(x=>x.close).filter(Number.isFinite);
const mean = (a:number[]) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
const sma = (a:number[], n:number) => a.length >= n ? mean(a.slice(-n)) : null;
function ema(a:number[], n:number) { if(a.length<n) return null; const k=2/(n+1); let e=mean(a.slice(0,n))!; for(let i=n;i<a.length;i++) e=a[i]*k+e*(1-k); return e; }
function std(a:number[], n:number) { if(a.length<n) return null; const m=mean(a.slice(-n))!; return Math.sqrt(mean(a.slice(-n).map(x=>(x-m)**2))!); }
function rsi(a:number[], n:number) { if(a.length<=n) return null; let gain=0,loss=0; for(let i=1;i<=n;i++){const d=a[i]-a[i-1]; gain+=Math.max(d,0); loss+=Math.max(-d,0);} gain/=n; loss/=n; for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1]; gain=(gain*(n-1)+Math.max(d,0))/n; loss=(loss*(n-1)+Math.max(-d,0))/n;} return loss===0?100:100-(100/(1+gain/loss)); }
function atr(c:Candle[], n:number) { if(c.length<=n) return null; const tr=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close))); return sma(tr,n); }
function returns(a:number[]) { return a.slice(1).map((x,i)=>Math.log(x/a[i])); }
function pct(v:number|null, base:number|null) { return finite(v)&&finite(base)&&base!==0 ? v/base*100 : null; }

export function analyzeTechnical(candles:Candle[], bids:OrderBookLevel[], asks:OrderBookLevel[]): TechnicalAnalysis {
  const warnings:string[]=[]; const c=candles.filter(x=>x.close>0&&x.high>=x.low).sort((a,b)=>a.openTime-b.openTime); const p=closes(c); const last=p.at(-1)??null;
  if(p.length<20) warnings.push('At least 20 validated candles are required for a reliable technical snapshot.');
  const ema20=ema(p,20), ema50=ema(p,50), sma20=sma(p,20), rsi14=rsi(p,14), e12=ema(p,12), e26=ema(p,26), macd=finite(e12)&&finite(e26)?e12-e26:null;
  const macdHistory = p.length>=35 ? p.map((_,i)=>i<26?null:ema(p.slice(0,i+1),12)!-ema(p.slice(0,i+1),26)!).filter(finite) : [];
  const macdSignal=macdHistory.length>=9?ema(macdHistory,9):null;
  const sd=std(p,20), bbMid=sma20, bbUpper=finite(bbMid)&&finite(sd)?bbMid+2*sd:null, bbLower=finite(bbMid)&&finite(sd)?bbMid-2*sd:null;
  const vwapDen=c.reduce((s,x)=>s+x.volume,0); const vwap=vwapDen>0?c.reduce((s,x)=>s+((x.high+x.low+x.close)/3)*x.volume,0)/vwapDen:null;
  const atr14=atr(c,14), atrPercent=pct(atr14,last), rets=returns(p.slice(-100)); const realized=rets.length?Math.sqrt(mean(rets.map(x=>x*x))!)*Math.sqrt(365)*100:null;
  const recent=c.slice(-10), highs=recent.map(x=>x.high), lows=recent.map(x=>x.low); const support=lows.length?Math.min(...lows):null, resistance=highs.length?Math.max(...highs):null;
  const half=Math.max(2,Math.floor(recent.length/2)); const h1=recent.slice(0,half), h2=recent.slice(half); const higherHighs=Boolean(h2.length&&Math.max(...h2.map(x=>x.high))>Math.max(...h1.map(x=>x.high))); const higherLows=Boolean(h2.length&&Math.min(...h2.map(x=>x.low))>Math.min(...h1.map(x=>x.low)));
  const trend=finite(ema20)&&finite(ema50)?ema20>ema50&&higherLows?'UP':ema20<ema50&&!higherHighs?'DOWN':'SIDEWAYS':'UNKNOWN';
  const bidNotional=bids.reduce((s,x)=>s+x.price*x.quantity,0), askNotional=asks.reduce((s,x)=>s+x.price*x.quantity,0), total=bidNotional+askNotional, imbalance=total? (bidNotional-askNotional)/total:null;
  const bestBid=bids.length?Math.max(...bids.map(x=>x.price)):null, bestAsk=asks.length?Math.min(...asks.map(x=>x.price)):null, spreadPercent=finite(bestBid)&&finite(bestAsk)&&bestBid>0?(bestAsk-bestBid)/bestBid*100:null;
  const volRegime=atrPercent===null?'UNKNOWN':atrPercent>3?'HIGH':atrPercent<0.7?'LOW':'NORMAL';
  let divergence:'BULLISH'|'BEARISH'|'NONE'|'UNKNOWN'='UNKNOWN';
  if(p.length>=30&&rsi14!==null){const old=p.slice(-30,-15), now=p.slice(-15); const oldLow=Math.min(...old), nowLow=Math.min(...now), oldHigh=Math.max(...old), nowHigh=Math.max(...now); const oldR=rsi(old,14), nowR=rsi(now,14); if(oldR!==null&&nowR!==null){if(nowLow<oldLow&&nowR>oldR)divergence='BULLISH'; else if(nowHigh>oldHigh&&nowR<oldR)divergence='BEARISH'; else divergence='NONE';}}
  const components=[rsi14!==null, ema20!==null, ema50!==null, macd!==null, bbUpper!==null, vwap!==null, atr14!==null, imbalance!==null].filter(Boolean).length;
  return {indicators:{ema20,ema50,sma20,rsi14,macd,macdSignal,bollingerUpper:bbUpper,bollingerMiddle:bbMid,bollingerLower:bbLower,vwap,atr14},structure:{trend,support,resistance,higherHighs,higherLows},volatility:{atrPercent,realizedPercent:realized,regime:volRegime},liquidity:{bidNotional,askNotional,imbalance,spreadPercent},divergence,confidence:Math.round(components/8*100),warnings};
}
