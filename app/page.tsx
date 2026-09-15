'use client';

import { useCallback, useEffect, useState } from 'react';

type Market={symbol:string;name:string;price:number;change24h:number;source?:string;quality?:string};
type Loop={symbol:string;interval:string;generatedAt:string;dataValid:boolean;cycleId?:string;signal?:any;forecast?:any;consensus?:any;risk?:any;multiTimeframe?:any;chartPatterns?:any;newsImpact?:any;eventReaction?:any;warnings?:string[];news?:any[]};
type Metrics={total:number;wins:number;losses:number;winRate:number|null;averageReturnPct:number|null;averageCalibrationGap:number|null};

function money(v:any){if(v==null||!Number.isFinite(Number(v)))return '—';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Number(v)>100?0:2}).format(Number(v))}
function pct(v:any){if(v==null||!Number.isFinite(Number(v)))return '—';return `${Number(v).toFixed(1)}%`}
function tone(v:string){return v==='LONG'||v==='BULLISH'?'up':v==='SHORT'||v==='BEARISH'?'down':''}
function ago(v:string){if(!v)return '—';const m=Math.max(0,Math.floor((Date.now()-Date.parse(v))/60000));return m<1?'now':m<60?`${m}m`:`${Math.floor(m/60)}h`}

function MarketCard({m,selected,onSelect}:{m:Market;selected:boolean;onSelect:()=>void}){
 return <button className={`card ${selected?'selected':''}`} onClick={onSelect}>
  <div className="label">{m.symbol.replace('USDT','')}/USD</div>
  <div className="price">{money(m.price)}</div>
  <div className={m.change24h>=0?'up':'down'}>{m.change24h>=0?'+':''}{m.change24h.toFixed(2)}%</div>
  <div className="mini">{m.quality||'live'} · {m.source||'provider'}</div>
 </button>
}

function Stat({label,value,detail,className}:{label:string;value:any;detail:any;className?:string}){
 return <article><small>{label}</small><strong className={className}>{value}</strong><span>{detail}</span></article>
}

export default function Home(){
 const [markets,setMarkets]=useState<Market[]>([]);
 const [loop,setLoop]=useState<Loop|null>(null);
 const [metrics,setMetrics]=useState<Metrics|null>(null);
 const [symbol,setSymbol]=useState('BTCUSDT');
 const [interval,setIntervalValue]=useState('15m');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [fa,setFa]=useState(false);
 const [installEvent,setInstallEvent]=useState<any>(null);

 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const results=await Promise.all([
    fetch('/api/market',{cache:'no-store'}),
    fetch(`/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,{cache:'no-store'}),
    fetch(`/api/forecast-metrics?symbol=${encodeURIComponent(symbol)}`,{cache:'no-store'})
   ]);
   const md=await results[0].json();
   const ld=await results[1].json();
   const fd=await results[2].json();
   if(!results[1].ok)throw new Error(ld.error||'Live intelligence unavailable');
   setMarkets(md.markets||[]);setLoop(ld);setMetrics(fd.metrics||null);
  }catch(e){setError(e instanceof Error?e.message:'Live intelligence unavailable')}
  finally{setLoading(false)}
 },[symbol,interval]);

 useEffect(()=>{refresh();const id=setInterval(refresh,30000);return()=>clearInterval(id)},[refresh]);
 useEffect(()=>{const f=(e:Event)=>{e.preventDefault();setInstallEvent(e)};window.addEventListener('beforeinstallprompt',f);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>window.removeEventListener('beforeinstallprompt',f)},[]);
 const install=async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;setInstallEvent(null)};

 const signal=loop?.signal||{};const forecast=loop?.forecast||{};const risk=loop?.risk||{};const consensus=loop?.consensus||{};const mtf=loop?.multiTimeframe||{};
 const warnings=[...(risk.reasons||[]),...(loop?.eventReaction?.reasons||[]),...(loop?.warnings||[])].slice(0,10);

 return <main className="shell" dir={fa?'rtl':'ltr'}>
  <header className="top">
   <a className="brand" href="#top">MARKET<span>/</span>INTEL</a>
   <nav className="nav"><a href="#markets">{fa?'بازارها':'Markets'}</a><a href="#intelligence">{fa?'هوش بازار':'Intelligence'}</a><a href="#news">{fa?'اخبار':'News'}</a><a href="#watchlist">{fa?'دیده‌بان':'Watchlist'}</a></nav>
   <div className="controls">
    <button className="refresh" onClick={()=>setFa(!fa)}>{fa?'EN':'FA'}</button>
    <select value={symbol} onChange={e=>setSymbol(e.target.value)}>{['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT'].map(x=><option key={x} value={x}>{x}</option>)}</select>
    <select value={interval} onChange={e=>setIntervalValue(e.target.value)}>{['5m','15m','1h','4h','1d'].map(x=><option key={x} value={x}>{x}</option>)}</select>
    {installEvent?<button className="install" onClick={install}>{fa?'نصب اپ':'Install'}</button>:null}
    <button className="refresh" onClick={refresh}>{loading?'…':fa?'بروزرسانی':'Refresh'}</button>
   </div>
  </header>

  <section className="hero" id="top">
   <div>
    <div className="eyebrow"><i className="dot"/>{loop?.dataValid?'LIVE':'LIMITED'} · {symbol} · {interval}</div>
    <h1>{fa?'هوش زنده بازار':'LIVE MARKET INTELLIGENCE'}<br/><em>{fa?'داده → ساختار → اجماع → اعتبارسنجی':'data → structure → consensus → validation'}</em></h1>
    <p>{fa?'داده بازار، ساختار تکنیکال، چندبازه‌ای، تحلیلگران، اخبار، ریسک و ارزیابی پیش‌بینی در یک چرخه زنده.':'Live market data, technical structure, multi-timeframe analysis, analyst consensus, news, risk and forecast evaluation in one cycle. No fabricated values.'}</p>
   </div>
   <div className="status"><b>{loop?.dataValid?'DATA VALID':'LIMITED DATA'}</b><span>{loop?.cycleId||'Waiting for cycle…'}</span><small>{loop?.generatedAt?`${ago(loop.generatedAt)} ago`:'—'}</small>{error?<small className="down">{error}</small>:null}</div>
  </section>

  <section className="ticker" id="markets">{markets.slice(0,6).map(m=><MarketCard key={m.symbol} m={m} selected={m.symbol===symbol} onSelect={()=>setSymbol(m.symbol)}/>)}</section>

  <section className="command" id="intelligence">
   <div className="commandTop">
    <div><div className="label">{fa?'سیگنال':'SIGNAL'}</div><div className="big"><strong className={tone(signal.direction)}>{signal.direction||'NO TRADE'}</strong><b>{pct(signal.confidence)}</b></div><div className="meter"><i style={{width:`${Math.min(100,Math.max(0,Number(signal.confidence)||0))}%`}}/></div>
    <button className="deep" onClick={refresh}>{fa?'اسکن عمیق':'DEEP SCAN'}</button>
   </div>
   <div className="statGrid">
    <Stat label="FORECAST" value={forecast.bias||'UNAVAILABLE'} className={tone(forecast.bias)} detail={`${pct(forecast.confidence)} · ${money(forecast.expectedLow)} — ${money(forecast.expectedHigh)}`}/>
    <Stat label="CONSENSUS" value={consensus.direction||'NO DATA'} detail={`${pct(consensus.confidence)} · ${consensus.views||0} analyst views`}/>
    <Stat label="RISK" value={risk.level||'UNKNOWN'} detail={`${risk.positionRisk||'—'} · score ${risk.score??'—'}`}/>
    <Stat label="MULTI-TIMEFRAME" value={String(mtf.alignment||'INSUFFICIENT').replaceAll('_',' ')} detail={`${mtf.conflict?'Conflict detected':'No conflict'} · score ${mtf.score??'—'}`}/>
   </div>
   <div className="levels"><span>Entry <b>{money(signal.entry)}</b></span><span>SL <b>{money(signal.stopLoss)}</b></span><span>TP <b>{money(signal.takeProfit)}</b></span><span>RR <b>{signal.rr??'—'}</b></span></div>
  </section>

  <section className="grid">
   <div className="section"><div className="sectionHead"><h2>{fa?'ریسک، ساختار و هشدارها':'RISK · STRUCTURE · WARNINGS'}</h2><small>{loop?.chartPatterns?.primary||'NO PATTERN'}</small></div><div className="body"><div className="chips"><span>{loop?.newsImpact?.level||'NO NEWS'}</span><span>{loop?.eventReaction?.level||'NO EVENT'}</span><span>{loop?.chartPatterns?.breakout||'NO BREAKOUT'}</span></div>{warnings.map((x:string,i:number)=><p className="bullet" key={`${i}-${x}`}>{x}</p>)}{warnings.length===0?<p className="muted">No active critical warnings from the current validation cycle.</p>:null}</div></div>
   <aside className="section"><div className="sectionHead"><h2>{fa?'سابقه یادگیری':'FORECAST TRACK RECORD'}</h2><small>{metrics?.total||0} evaluated</small></div><div className="learning"><div><strong>{metrics?.winRate==null?'—':pct(metrics.winRate*100)}</strong><span>win rate</span></div><div><strong>{metrics?.averageReturnPct==null?'—':pct(metrics.averageReturnPct)}</strong><span>avg return</span></div><div><strong>{metrics?.averageCalibrationGap==null?'—':pct(metrics.averageCalibrationGap)}</strong><span>calibration gap</span></div></div><p className="muted">{metrics?.total?`${metrics.wins} wins · ${metrics.losses} losses`:(fa?'هنوز سابقه ارزیابی کافی نیست':'No evaluated history yet')}</p></aside>
  </section>

  <section className="section" id="news"><div className="sectionHead"><h2>{fa?'نبض اخبار':'NEWS PULSE'}</h2><small>{loop?.newsImpact?.breakingCount||0} breaking · {loop?.newsImpact?.highImpactCount||0} high impact</small></div>{(loop?.news||[]).slice(0,8).map((n:any,i:number)=><a className="news" href={n.url} target="_blank" rel="noreferrer" key={`${i}-${n.title}`}><span className="rank">{String(i+1).padStart(2,'0')}</span><div><div className="tag">{n.category||'MARKET'} · {n.source}</div><h3>{n.title}</h3><p>{ago(n.publishedAt)} ago</p></div><span className="arrow">↗</span></a>)}{!loop?.news?.length?<div className="empty">No validated stories available.</div>:null}</section>

  <section className="section watch" id="watchlist"><div className="sectionHead"><h2>{fa?'دیده‌بان':'WATCHLIST'}</h2><small>NO AUTO-TRADING</small></div><div className="watchGrid">{markets.slice(0,6).map(m=><button key={m.symbol} onClick={()=>setSymbol(m.symbol)}><b>{m.symbol.replace('USDT','')}</b><span>{money(m.price)}</span><em className={m.change24h>=0?'up':'down'}>{m.change24h>=0?'+':''}{m.change24h.toFixed(2)}%</em></button>)}</div></section>
  <footer className="footer"><b>MARKET/INTEL</b> · informational intelligence only · no automatic orders, transfers or withdrawals.</footer>
 </main>;
}
