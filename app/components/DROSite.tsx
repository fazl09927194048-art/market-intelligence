'use client';
import React,{useEffect,useMemo,useState} from 'react';
import MarketChart from './MarketChart';
import AIChat from './AIChat';

type Tool='SIG'|'CHT'|'MTF'|'BOOK'|'DER'|'NEWS'|'RISK'|'AI'|'SCAN';
const tools:Tool[]=['SIG','CHT','MTF','BOOK','DER','NEWS','RISK','AI','SCAN'];
const faTools:Record<Tool,string>={SIG:'سیگنال',CHT:'چارت',MTF:'چندبازه',BOOK:'دفتر سفارش',DER:'مشتقات',NEWS:'اخبار',RISK:'ریسک',AI:'مربی AI',SCAN:'اسکن عمیق'};
const money=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:Number(v)>100?2:6}).format(Number(v));
const pct=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`;
const tone=(v:string)=>v==='LONG'||v==='BULLISH'?'up':v==='SHORT'||v==='BEARISH'?'down':'';

export default function DROSite({symbol,interval,fa=false}:{symbol:string;interval:string;fa?:boolean}){
 const [open,setOpen]=useState(false),[tool,setTool]=useState<Tool>('SIG'),[loop,setLoop]=useState<any>(null),[advanced,setAdvanced]=useState<any>(null),[loading,setLoading]=useState(false);
 const load=async()=>{setLoading(true);try{const [a,b]=await Promise.all([fetch(`/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,{cache:'no-store'}),fetch(`/api/market/advanced?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=30`,{cache:'no-store'})]);setLoop(await a.json());setAdvanced(await b.json())}catch{}finally{setLoading(false)}};
 useEffect(()=>{if(open)load();},[open,symbol,interval]);
 const s=loop?.signal||{},f=loop?.forecast||{},r=loop?.risk||{},c=loop?.consensus||{},m=loop?.multiTimeframe||{};
 const ctx={signal:s,forecast:f,risk:r,consensus:c,multiTimeframe:m,newsImpact:loop?.newsImpact,events:loop?.eventReaction,news:(loop?.news||[]).slice(0,10),warnings:loop?.warnings||[]};
 const title=fa?faTools[tool]:({SIG:'SIGNAL',CHT:'LIVE CHART',MTF:'MULTI TIMEFRAME',BOOK:'ORDER BOOK',DER:'DERIVATIVES',NEWS:'NEWS INTELLIGENCE',RISK:'RISK ENGINE',AI:'AI COACH',SCAN:'DEEP SCAN'} as Record<Tool,string>)[tool];
 const body=useMemo(()=>{
  if(tool==='CHT')return <MarketChart symbol={symbol} interval={interval} fa={fa}/>;
  if(tool==='AI')return <AIChat symbol={symbol} interval={interval} context={ctx} fa={fa}/>;
  if(tool==='SIG')return <div className="droSignal"><span className={tone(s.direction)}>{s.direction||'NO TRADE'}</span><b>{pct(s.confidence)}</b><div className="droMeter"><i style={{width:`${Math.min(100,Math.max(0,Number(s.confidence)||0))}%`}}/></div><div className="droRows"><span>Entry <b>{money(s.entry)}</b></span><span>SL <b>{money(s.stopLoss)}</b></span><span>TP <b>{money(s.takeProfit)}</b></span><span>RR <b>{s.rr??'—'}</b></span></div><p>{c.direction||'Consensus unavailable'} · {pct(c.confidence)} · {c.views||0} views</p></div>;
  if(tool==='MTF')return <div className="droRows big"><span>Alignment <b>{m.alignment||'INSUFFICIENT'}</b></span><span>Score <b>{m.score??'—'}</b></span><span>Conflict <b>{m.conflict?'YES':'NO'}</b></span><span>Forecast <b>{f.bias||'—'} {pct(f.confidence)}</b></span></div>;
  if(tool==='BOOK'){const b=advanced?.futures?.orderBook||advanced?.spot?.orderBook||advanced?.orderBook||{};const bids=b.bids||[];const asks=b.asks||[];return <div className="droBook"><div><b>ASKS</b>{asks.slice(0,5).map((x:any,i:number)=><span key={i}>{money(x[0]??x.price)} <em>{money(x[1]??x.qty)}</em></span>)}</div><div><b>BIDS</b>{bids.slice(0,5).map((x:any,i:number)=><span key={i}>{money(x[0]??x.price)} <em>{money(x[1]??x.qty)}</em></span>)}</div></div>}
  if(tool==='DER'){const d=advanced?.futures||{};return <div className="droRows big"><span>Funding <b>{d.fundingRate==null?'—':pct(Number(d.fundingRate)*100)}</b></span><span>Open Interest <b>{money(d.openInterest)}</b></span><span>Mark <b>{money(d.markPrice)}</b></span><span>Index <b>{money(d.indexPrice)}</b></span></div>}
  if(tool==='NEWS'){return <div className="droNews">{(loop?.news||[]).slice(0,6).map((n:any,i:number)=><a key={i} href={n.url} target="_blank" rel="noreferrer"><b>{n.category||'MARKET'}</b><span>{n.title}</span></a>)}</div>}
  if(tool==='RISK')return <div className="droRows big"><span>Level <b className={tone(r.level)}>{r.level||'UNKNOWN'}</b></span><span>Score <b>{r.score??'—'}</b></span><span>Position <b>{r.positionRisk||'—'}</b></span>{(r.reasons||[]).slice(0,3).map((x:string,i:number)=><span key={i}>{x}</span>)}</div>;
  return <div className="droScan"><b>{loading?'SCANNING…':'DEEP SCAN READY'}</b><p>{loading?'Live market, technical, MTF, news, consensus and risk engines are being refreshed.':'Run a full validation cycle across signal, forecast, consensus, multi-timeframe, news and risk.'}</p><button onClick={load}>{fa?'اجرای اسکن':'RUN DEEP SCAN'}</button></div>;
 },[tool,symbol,interval,fa,loop,advanced,loading]);
 return <div className={`droSite ${open?'isOpen':''}`}><button className="droOrb" aria-label="DRO" onClick={()=>setOpen(v=>!v)}><span className="droTree" aria-hidden="true">♣</span><small>DRO</small></button>{open&&<div className="droPanel" dir={fa?'rtl':'ltr'}><div className="droHead"><div><b>DRO</b><small>{symbol} · {interval}</small></div><button onClick={()=>setOpen(false)}>×</button></div><div className="droTools">{tools.map(x=><button key={x} className={tool===x?'active':''} onClick={()=>setTool(x)}><strong>{x}</strong><small>{fa?faTools[x]:x}</small></button>)}</div><div className="droContent"><div className="droTitle"><b>{title}</b><span>{loading?'LIVE…':'LIVE'}</span></div>{body}</div></div>}</div>;
}
