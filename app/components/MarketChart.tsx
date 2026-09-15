'use client';
import React,{useEffect,useMemo,useState} from 'react';

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
type Props={symbol:string;interval:string;fa?:boolean};

const money=(v:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:v>=100?2:v>=1?4:8}).format(v);
const toCandle=(row:any):Candle|null=>{if(!Array.isArray(row)||row.length<6)return null;const n=row.map(Number);if(n.slice(0,6).some((x:number)=>!Number.isFinite(x)))return null;return {time:n[0],open:n[1],high:n[2],low:n[3],close:n[4],volume:n[5]};};

export default function MarketChart({symbol,interval,fa=false}:Props){
 const [candles,setCandles]=useState<Candle[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hover,setHover]=useState<Candle|null>(null);
 useEffect(()=>{let dead=false;const load=async()=>{setLoading(true);setError('');try{const r=await fetch(`/api/market/advanced?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=120`,{cache:'no-store'});const d=await r.json();const source=d.futures?.candles?.length?d.futures.candles:d.spot?.candles||[];const parsed=source.map(toCandle).filter(Boolean).slice(-100) as Candle[];if(!parsed.length)throw new Error(fa?'کندل زنده دریافت نشد':'Live candles unavailable');if(!dead)setCandles(parsed);}catch(e){if(!dead){setCandles([]);setError(e instanceof Error?e.message:'Chart unavailable')}}finally{if(!dead)setLoading(false)}};load();const id=setInterval(load,5000);return()=>{dead=true;clearInterval(id)}},[symbol,interval,fa]);
 const geom=useMemo(()=>{if(!candles.length)return null;const width=1000,height=390,padX=18,padY=18;const min=Math.min(...candles.map(c=>c.low)),max=Math.max(...candles.map(c=>c.high)),range=Math.max(max-min,max*0.000001);const step=(width-padX*2)/candles.length;const y=(v:number)=>padY+(max-v)/range*(height-padY*2);return {width,height,min,max,step,y};},[candles]);
 return <section className="chartTool" aria-label="Live crypto candlestick chart">
  <div className="chartHead"><div><b>{symbol.replace('USDT','/USDT')} · {interval}</b><small>{loading?'SYNCING LIVE CANDLES':error||`${candles.length} OHLC candles · 5s refresh`}</small></div><div className="chartValue">{hover?`${money(hover.close)} · H ${money(hover.high)} · L ${money(hover.low)}`:candles.length?money(candles[candles.length-1].close):'—'}</div></div>
  <div className="chartCanvas">{geom&&<svg viewBox={`0 0 ${geom.width} ${geom.height}`} preserveAspectRatio="none">
   <path d={`M ${18} ${geom.y((geom.min+geom.max)/2)} H ${geom.width-18}`} className="chartGrid"/>
   {candles.map((c,i)=>{const x=18+i*geom.step+geom.step/2;const up=c.close>=c.open;const bodyTop=geom.y(Math.max(c.open,c.close));const bodyBottom=geom.y(Math.min(c.open,c.close));const bodyH=Math.max(1,bodyBottom-bodyTop);return <g key={`${c.time}-${i}`} onMouseEnter={()=>setHover(c)} onMouseLeave={()=>setHover(null)} className={up?'candle upC':'candle downC'}><line x1={x} x2={x} y1={geom.y(c.high)} y2={geom.y(c.low)}/><rect x={x-Math.max(1,geom.step*.29)} y={bodyTop} width={Math.max(2,geom.step*.58)} height={bodyH} rx="1"/></g>})}
  </svg>}{!geom&&!loading&&<div className="chartEmpty">{error||'No chart data'}</div>}</div>
  <div className="chartFoot"><span>LIVE OHLCV</span><span>{fa?'داده‌ها از بازار دریافت می‌شوند':'Exchange market data · no fabricated candles'}</span></div>
 </section>;
}
