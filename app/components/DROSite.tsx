'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import MarketChart from './MarketChart';
import AIChat from './AIChat';

type Tool='SIG'|'CHT'|'MTF'|'BOOK'|'DER'|'NEWS'|'RISK'|'AI'|'SCAN';
const tools:Tool[]=['SIG','CHT','MTF','BOOK','DER','NEWS','RISK','AI','SCAN'];
const faTools:Record<Tool,string>={SIG:'سیگنال',CHT:'چارت',MTF:'چندبازه',BOOK:'دفتر سفارش',DER:'مشتقات',NEWS:'اخبار',RISK:'ریسک',AI:'مربی AI',SCAN:'اسکن عمیق'};
const money=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:Number(v)>100?2:6}).format(Number(v));
const pct=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`;
const tone=(v:string)=>v==='LONG'||v==='BULLISH'?'up':v==='SHORT'||v==='BEARISH'?'down':'';

export default function DROSite({symbol,interval,fa=false}:{symbol:string;interval:string;fa?:boolean}){
 const [open,setOpen]=useState(false); const [tool,setTool]=useState<Tool>('SIG');
 const [loop,setLoop]=useState<any>(null); const [advanced,setAdvanced]=useState<any>(null); const [loading,setLoading]=useState(false); const [scanError,setScanError]=useState('');
 const [position,setPosition]=useState({x:0,y:0});
 const drag=useRef({active:false,moved:false,id:-1,dx:0,dy:0}); const busy=useRef(false);
 const key=`${symbol}:${interval}`;
 const clamp=useCallback((x:number,y:number)=>({x:Math.max(6,Math.min(x,window.innerWidth-66)),y:Math.max(6,Math.min(y,window.innerHeight-66))}),[]);
 useEffect(()=>{try{const saved=window.localStorage.getItem('dro-floating-position');if(saved){const p=JSON.parse(saved);if(Number.isFinite(p.x)&&Number.isFinite(p.y)){setPosition(clamp(p.x,p.y));return}}}catch{} setPosition(clamp(window.innerWidth-80,window.innerHeight-80));},[clamp]);
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[clamp]);
 const startDrag=(e:any)=>{if(e.pointerType==='mouse'&&e.button!==0)return;const r=e.currentTarget.getBoundingClientRect();drag.current={active:true,moved:false,id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};e.currentTarget.setPointerCapture(e.pointerId);};
 const moveDrag=(e:any)=>{if(!drag.current.active||drag.current.id!==e.pointerId)return;const r=e.currentTarget.getBoundingClientRect();if(Math.abs(e.clientX-(r.left+drag.current.dx))+Math.abs(e.clientY-(r.top+drag.current.dy))>3)drag.current.moved=true;if(drag.current.moved){const p=clamp(e.clientX-drag.current.dx,e.clientY-drag.current.dy);setPosition(p);window.localStorage.setItem('dro-floating-position',JSON.stringify(p));}};
 const endDrag=(e:any)=>{if(drag.current.id!==e.pointerId)return;drag.current.active=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
 const toggle=()=>{if(!drag.current.moved)setOpen(v=>!v);setTimeout(()=>{drag.current.moved=false},0)};
 const load=useCallback(async(force=false)=>{if(busy.current)return;busy.current=true;setLoading(true);setScanError('');try{const r=await fetch(`/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}${force?'&refresh=1':''}`,{cache:'no-store'});const d=await r.json();if(!r.ok||d?.dataValid===false)throw new Error(d?.error||'Scan failed');setLoop(d);}catch(e){setScanError(e instanceof Error?e.message:'Scan failed')}finally{busy.current=false;setLoading(false)}},[symbol,interval]);
 const loadAdvanced=useCallback(async()=>{try{const r=await fetch(`/api/market/advanced?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=30`,{cache:'no-store'});if(r.ok)setAdvanced(await r.json())}catch{}},[symbol,interval]);
 useEffect(()=>{setLoop(null);setAdvanced(null);setScanError('')},[symbol,interval]);
 useEffect(()=>{if(open&&!loop)void load(false)},[open,loop,load]);
 useEffect(()=>{if(open&&(tool==='BOOK'||tool==='DER'))void loadAdvanced()},[open,tool,loadAdvanced]);
 const s=loop?.signal||{},f=loop?.forecast||{},r=loop?.risk||{},c=loop?.consensus||{},m=loop?.multiTimeframe||{};
 const ctx={signal:s,forecast:f,risk:r,consensus:c,multiTimeframe:m,newsImpact:loop?.newsImpact,events:loop?.eventReaction,news:(loop?.news||[]).slice(0,10),warnings:loop?.warnings||[]};
 const title=fa?faTools[tool]:({SIG:'SIGNAL',CHT:'LIVE CHART',MTF:'MULTI TIMEFRAME',BOOK:'ORDER BOOK',DER:'DERIVATIVES',NEWS:'NEWS INTELLIGENCE',RISK:'RISK ENGINE',AI:'AI COACH',SCAN:'DEEP SCAN'} as Record<Tool,string>)[tool];
 const renderBody=()=>{
  if(tool==='CHT')return <MarketChart symbol={symbol} interval={interval} fa={fa}/>;
  if(tool==='AI')return <AIChat symbol={symbol} interval={interval} context={ctx} fa={fa}/>;
  if(tool==='SIG')return <div className="droSignal"><strong className={tone(s.direction)}>{s.direction||'NO TRADE'}</strong><b>{pct(s.confidence)}</b><div className="droMeter"><i style={{width:`${Math.min(100,Math.max(0,Number(s.confidence)||0))}%`}}/></div><div className="droRows"><span>Entry<b>{money(s.entry)}</b></span><span>SL<b>{money(s.stopLoss)}</b></span><span>TP<b>{money(s.takeProfit)}</b></span><span>RR<b>{s.rr??'—'}</b></span></div><p>{c.direction||'Consensus unavailable'} · {pct(c.confidence)}</p></div>;
  if(tool==='MTF')return <div className="droRows big"><span>Alignment<b>{m.alignment||'INSUFFICIENT'}</b></span><span>Score<b>{m.score??'—'}</b></span><span>Conflict<b>{m.conflict?'YES':'NO'}</b></span><span>Forecast<b>{f.bias||'—'} {pct(f.confidence)}</b></span></div>;
  if(tool==='BOOK'){const b=advanced?.futures?.orderBook||advanced?.spot?.orderBook||advanced?.orderBook||{};return <div className="droBook"><div><b>ASKS</b>{(b.asks||[]).slice(0,6).map((x:any,i:number)=><span key={i}>{money(x[0]??x.price)} <em>{money(x[1]??x.qty)}</em></span>)}</div><div><b>BIDS</b>{(b.bids||[]).slice(0,6).map((x:any,i:number)=><span key={i}>{money(x[0]??x.price)} <em>{money(x[1]??x.qty)}</em></span>)}</div></div>}
  if(tool==='DER'){const d=advanced?.futures||{};return <div className="droRows big"><span>Funding<b>{d.fundingRate==null?'—':pct(Number(d.fundingRate)*100)}</b></span><span>Open Interest<b>{money(d.openInterest)}</b></span><span>Mark<b>{money(d.markPrice)}</b></span><span>Index<b>{money(d.indexPrice)}</b></span></div>}
  if(tool==='NEWS')return <div className="droNews">{(loop?.news||[]).slice(0,7).map((n:any,i:number)=><a key={i} href={n.url} target="_blank" rel="noreferrer"><b>{n.category||'MARKET'}</b><span>{n.title}</span></a>)}</div>;
  if(tool==='RISK')return <div className="droRows big"><span>Level<b className={tone(r.level)}>{r.level||'UNKNOWN'}</b></span><span>Score<b>{r.score??'—'}</b></span><span>Position<b>{r.positionRisk||'—'}</b></span>{(r.reasons||[]).slice(0,3).map((x:any,i:number)=><span key={i}>{x}</span>)}</div>;
  return <div className="droScan"><div className="scanStatus"><b>{loading?'SCANNING…':scanError?'SCAN ERROR':loop?'SCAN READY':'READY'}</b></div><p>{scanError||'Deep Scan combines live market, technical, multi-timeframe, news, consensus and risk evidence.'}</p><button disabled={loading} onClick={()=>load(true)}>{loading?'SCANNING…':'NEW DEEP SCAN'}</button></div>;
 };
 return <div className="droSite" style={{left:position.x,top:position.y}}><button className="droOrb" aria-label="DRO" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={toggle}><span>🌳</span><small>DRO</small></button>{open&&<div className="droPanel" dir={fa?'rtl':'ltr'}><header><div><b>DRO</b><small>{symbol} · {interval}</small></div><button onClick={()=>setOpen(false)}>×</button></header><nav>{tools.map(x=><button key={x} className={tool===x?'active':''} onClick={()=>setTool(x)}><strong>{x}</strong><small>{fa?faTools[x]:x}</small></button>)}</nav><main><div className="droTitle"><b>{title}</b><span>{loading?'SCANNING':'CONNECTED'}</span></div>{renderBody()}</main></div>}</div>;
}

<style jsx global>{`
.droSite{position:fixed;z-index:2147483000;font-family:Inter,system-ui,sans-serif;will-change:left,top}
.droOrb{width:58px;height:58px;border-radius:19px;border:1px solid #355b42;background:radial-gradient(circle at 35% 25%,#193b27,#0a130e 62%);color:#b5ffca;display:grid;place-items:center;cursor:grab;touch-action:none;user-select:none;box-shadow:0 12px 45px rgba(0,0,0,.55),0 0 28px rgba(83,221,128,.12)}
.droOrb:active{cursor:grabbing}.droOrb span{font-size:27px;line-height:24px}.droOrb small{font-size:7px;font-weight:950;letter-spacing:.18em;margin-top:-3px}
.droPanel{position:absolute;left:0;bottom:70px;width:min(430px,calc(100vw - 24px));max-height:min(700px,calc(100vh - 95px));overflow:hidden;border:1px solid #263d30;border-radius:20px;background:linear-gradient(145deg,#09100d,#070a0e 55%,#0b1015);box-shadow:0 28px 100px rgba(0,0,0,.7);backdrop-filter:blur(22px)}
.droPanel header{display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid #1b2921}.droPanel header b{font-size:15px}.droPanel header small{display:block;color:#66776c;font-size:8px;margin-top:3px}.droPanel header button{border:0;background:transparent;color:#758184;font-size:22px;cursor:pointer}
.droPanel nav{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;padding:8px;border-bottom:1px solid #19231e;background:#080d0b}.droPanel nav button{border:1px solid #17231c;background:#0b120e;color:#708076;border-radius:9px;padding:6px 2px;cursor:pointer}.droPanel nav button.active{border-color:#4d9563;background:#102017;color:#b0ffc4}.droPanel nav strong,.droPanel nav small{display:block}.droPanel nav strong{font-size:9px}.droPanel nav small{font-size:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.droPanel main{padding:11px;overflow:auto;max-height:590px}.droTitle{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.droTitle b{font-size:10px}.droTitle span{font-size:7px;color:#62e28b;border:1px solid #2d5c3c;padding:4px 6px;border-radius:999px}
.droSignal,.droScan{background:#0b1110;border:1px solid #1b2a21;border-radius:13px;padding:14px}.droSignal>strong{display:block;font-size:29px}.droSignal>b{font-size:14px;color:#8ceca8}.droMeter{height:5px;background:#202a25;border-radius:8px;overflow:hidden;margin:10px 0}.droMeter i{display:block;height:100%;background:#62e28b}.droRows{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.droRows span{padding:8px;border:1px solid #18241d;background:#080d0b;border-radius:8px;color:#69776f;font-size:8px;line-height:1.45}.droRows b{display:block;color:#d8e7dd;font-size:10px;margin-top:3px}.droRows.big{grid-template-columns:1fr 1fr}.droSignal p,.droScan p{color:#6f7d75;font-size:9px;line-height:1.5}
.droBook{display:grid;grid-template-columns:1fr 1fr;gap:8px}.droBook>div{background:#0b1010;border:1px solid #18241d;border-radius:11px;padding:9px}.droBook>div>b{display:block;font-size:8px;margin-bottom:5px;color:#8ceca8}.droBook span{display:flex;justify-content:space-between;font-size:8px;color:#9aa69e;padding:5px 0;border-bottom:1px solid #141d18}.droBook em{font-style:normal;color:#68756e}.droNews{display:grid;gap:6px}.droNews a{display:grid;gap:4px;text-decoration:none;border:1px solid #19251e;background:#0b100e;border-radius:10px;padding:9px}.droNews b{font-size:7px;color:#64dc8a}.droNews span{font-size:9px;line-height:1.4;color:#d1dbd5}.droScan button{width:100%;border:1px solid #3c734d;background:#102318;color:#a4f5b9;border-radius:9px;padding:10px;font-size:9px;font-weight:900;cursor:pointer}.droScan button:disabled{opacity:.55;cursor:wait}.droPanel :global(.chart){margin:0!important;border-radius:12px!important;max-width:none!important}
@media(max-width:620px){.droPanel{width:calc(100vw - 24px);bottom:66px}.droPanel nav{grid-template-columns:repeat(5,1fr)}.droOrb{width:54px;height:54px}}
`}</style>
