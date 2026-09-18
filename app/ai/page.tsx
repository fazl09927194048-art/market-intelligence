'use client';

import React,{useCallback,useEffect,useMemo,useState} from 'react';
import AIChat from '@/app/components/AIChat';

type Analyst={id:string;name:string;specialty:string;focus:string[];direction?:string;score?:number;confidence?:number;thesis?:string;independentMethod?:string;conflicts?:string[];evidence?:string[];memory?:{evaluatedPredictions:number;winRate:number|null;currentWeight:number}};
type Intelligence={symbol:string;interval:string;generatedAt:string;dataValid:boolean;cycleId:string;signal:any;forecast:any;scenarios:any;decisionAudit:any;consensus:any;risk:any;multiTimeframe:any;analysts:Analyst[];newsImpact:any;warnings:string[];technical:any;marketData:any;news:any[]};

const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT'];
const INTERVALS=['5m','15m','1h','4h','1d'];
const pct=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':`${Number(v).toFixed(1)}%`;
const money=(v:any)=>v==null||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Number(v)>100?0:2}).format(Number(v));
const directionClass=(d?:string)=>d==='LONG'||d==='BULLISH'?'up':d==='SHORT'||d==='BEARISH'?'down':'';

export default function AIPage(){
 const [symbol,setSymbol]=useState('BTCUSDT'),[interval,setIntervalValue]=useState('15m'),[data,setData]=useState<Intelligence|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[fa,setFa]=useState(false),[filter,setFilter]=useState('ALL'),[query,setQuery]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{const r=await fetch(`/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'AI cycle unavailable');setData(d)}
  catch(e){setError(e instanceof Error?e.message:'AI cycle unavailable')}finally{setLoading(false)}
 },[symbol,interval]);
 useEffect(()=>{void refresh()},[refresh]);
 const analysts=useMemo(()=>{const all=data?.analysts||[];return all.filter(a=>filter==='ALL'||a.direction===filter).filter(a=>!query||a.name.toLowerCase().includes(query.toLowerCase())||a.specialty.toLowerCase().includes(query.toLowerCase())||a.id.toLowerCase().includes(query.toLowerCase()))},[data,filter,query]);
 const context={signal:data?.signal,forecast:data?.forecast,scenarios:data?.scenarios,decisionAudit:data?.decisionAudit,risk:data?.risk,consensus:data?.consensus,multiTimeframe:data?.multiTimeframe,newsImpact:data?.newsImpact,news:data?.news?.slice(0,10),warnings:data?.warnings,analysts:data?.analysts?.slice(0,33)};
 return <main className="aiPage" dir={fa?'rtl':'ltr'}>
  <header className="aiPageTop">
   <a className="brand" href="/">MARKET<span>/</span>INTEL</a>
   <div className="aiPageTitle"><small>FLI ADVANCED MARKET INTELLIGENCE AI</small><strong>{fa?'مرکز هوش مصنوعی بازار':'AI MARKET COMMAND CENTER'}</strong></div>
   <div className="controls"><button className="refresh" onClick={()=>setFa(v=>!v)}>{fa?'EN':'FA'}</button><a className="refresh" href="/">Dashboard</a></div>
  </header>

  <section className="aiHero">
   <div>
    <div className="eyebrow"><i className="dot"/>{data?.dataValid?'LIVE INTELLIGENCE':'VALIDATION LIMITED'} · {symbol} · {interval}</div>
    <h1>{fa?'هوش بازار، در یک صفحه مستقل.':'ONE AI. 33 SPECIALISTS. ONE DECISION LAYER.'}</h1>
    <p>{fa?'این صفحه مرکز مستقل تحلیل FLI است: داده زنده، ۳۳ تحلیلگر تخصصی، اجماع، سناریو، ریسک، اخبار و گفت‌وگوی مستقیم با DRO.':'A dedicated intelligence workspace for live market data, 33 specialist analysts, consensus, scenarios, risk, news and direct DRO interaction.'}</p>
   </div>
   <div className="aiControls">
    <select value={symbol} onChange={e=>setSymbol(e.currentTarget.value)}>{SYMBOLS.map(x=><option key={x}>{x}</option>)}</select>
    <select value={interval} onChange={e=>setIntervalValue(e.currentTarget.value)}>{INTERVALS.map(x=><option key={x}>{x}</option>)}</select>
    <button className="deep" onClick={()=>void refresh()} disabled={loading}>{loading?'SCANNING…':fa?'اسکن کامل':'FULL SCAN'}</button>
   </div>
  </section>

  {error&&<div className="aiError">{error}</div>}

  <section className="aiDecision">
   <div className="decisionMain"><small>MAIN DECISION ENGINE</small><div><strong className={directionClass(data?.signal?.direction)}>{data?.signal?.direction||'NO TRADE'}</strong><b>{pct(data?.signal?.confidence)}</b></div><p>{data?.signal?.invalidation||data?.signal?.reason||'Waiting for a validated intelligence cycle.'}</p></div>
   <div className="decisionStats">
    <div><small>PRICE</small><b>{money(data?.marketData?.spot?.price||data?.signal?.entry)}</b></div>
    <div><small>FORECAST</small><b className={directionClass(data?.forecast?.bias)}>{data?.forecast?.bias||'—'}</b><span>{pct(data?.forecast?.confidence)}</span></div>
    <div><small>CONSENSUS</small><b className={directionClass(data?.consensus?.direction)}>{data?.consensus?.direction||'—'}</b><span>{data?.consensus?.long??0}L · {data?.consensus?.short??0}S · {pct(data?.consensus?.agreement)}</span></div>
    <div><small>RISK</small><b>{data?.risk?.level||'—'}</b><span>{data?.risk?.positionRisk||'—'}</span></div>
   </div>
   <div className="levels"><span>Entry <b>{money(data?.signal?.entry)}</b></span><span>SL <b>{money(data?.signal?.stopLoss)}</b></span><span>TP <b>{money(data?.signal?.takeProfit)}</b></span><span>RR <b>{data?.signal?.rr??'—'}</b></span></div>
  </section>

  <section className="aiPanel scenarioPanel">
   <div className="aiPanelHead"><div><small>SCENARIO ENGINE</small><h2>Three-Path Market Map</h2></div><span>{data?.scenarios?.dominant?.toUpperCase()||'—'} DOMINANT</span></div>
   <div className="scenarioGrid">{(data?.scenarios?.scenarios||[]).map((s:any)=><article className={`scenarioCard ${s.id}`} key={s.id}><div><b>{s.label}</b><strong>{s.probability}%</strong></div><div className="scenarioBar"><i style={{width:`${s.probability}%`}}/></div><small>TRIGGER</small><p>{s.trigger}</p><small>INVALIDATION</small><p>{s.invalidation}</p><small>TARGET</small><b>{money(s.target)}</b></article>)}</div>
   <div className="calibrationNote">{data?.scenarios?.calibrationNote||'Scenario estimates require validation and are not guarantees.'}</div>
  </section>

  <section className="aiPanel auditPanel">
   <div className="aiPanelHead"><div><small>ANALYST FAMILY WEIGHTS</small><h2>De-correlated Evidence Map</h2></div><span>WEIGHTED IMPACT</span></div>
   <div className="familyGrid">{(data?.decisionAudit?.familyImpact||[]).map((x:any)=><div className="familyCard" key={x.family}><small>{x.family}</small><b>{x.signed>0?'+':''}{x.signed}</b><span>{x.analysts} specialists · impact {x.impact}</span></div>)}</div>
  </section>

  <section className="aiPanel auditPanel">
   <div className="aiPanelHead"><div><small>CENTRAL DECISION AUDIT</small><h2>Why the Engine Reached This State</h2></div><span>{data?.decisionAudit?.coverage||0} SPECIALISTS VERIFIED</span></div>
   <div className="auditGrid">
    <div className="auditStat"><small>LONG / SHORT / NEUTRAL</small><b>{data?.decisionAudit?.directions?.LONG??0} / {data?.decisionAudit?.directions?.SHORT??0} / {data?.decisionAudit?.directions?.NEUTRAL??0}</b></div>
    <div className="auditStat"><small>CONTRADICTIONS</small><b>{data?.decisionAudit?.contradictions??0}</b></div><div className="auditStat"><small>ADAPTIVE RELIABILITY</small><b>{data?.consensus?.reliability??'—'}</b></div>
    <div className="auditStat"><small>DOMINANT SCENARIO</small><b>{data?.decisionAudit?.dominantScenario?.toUpperCase()||'—'}</b></div>
   </div>
   <div className="auditCols"><div><small>STRONGEST CONTRIBUTORS</small>{(data?.decisionAudit?.strongest||[]).map((x:any)=><div className="auditRow" key={x.id}><span>{x.id}</span><b className={directionClass(x.direction)}>{x.direction}</b><em>{x.score} · {x.confidence}%</em></div>)}</div><div><small>ACTIVE CONFLICTS</small>{(data?.decisionAudit?.conflicts||[]).slice(0,8).map((x:any,i:number)=><p className="bullet" key={i}><b>{x.analyst}</b> — {x.conflict}</p>)}</div></div>
  </section>

  <section className="aiWorkspace">
   <div className="aiPanel">
    <div className="aiPanelHead"><div><small>33 SPECIALIST ANALYSTS</small><h2>{fa?'اتاق تحلیلگران':'SPECIALIST WAR ROOM'}</h2></div><span>{analysts.length}/33</span></div>
    <div className="analystToolbar">
     <input value={query} onChange={e=>setQuery(e.currentTarget.value)} placeholder={fa?'جستجوی تحلیلگر…':'Search analyst…'}/>
     <div>{['ALL','LONG','SHORT','NEUTRAL'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    </div>
    <div className="analystGrid">
     {analysts.map(a=><article className="analystCard" key={a.id}>
      <div className="analystTop"><span className="analystIndex">#{(data?.analysts||[]).findIndex(x=>x.id===a.id)+1}</span><span className={directionClass(a.direction)}>{a.direction||'NEUTRAL'}</span></div>
      <h3>{a.name}</h3><small>{a.specialty}</small>
      <div className="analystScore"><b>{a.score??0}</b><span>{a.confidence??0}% confidence</span></div>
      <div className="analystBar"><i style={{width:`${Math.min(100,Math.abs(a.score||0))}%`}}/></div>
      <p>{a.independentMethod||a.thesis||'Independent specialist model.'}</p>
      {a.conflicts?.length?<div className="analystConflict">⚠ {a.conflicts[0]}</div>:null}
      <footer>{a.memory?.evaluatedPredictions||0} evaluated · weight {(a.memory?.currentWeight??1).toFixed(2)}</footer>
     </article>)}
    </div>
   </div>
   <aside className="aiSide">
    <section className="aiPanel">
     <div className="aiPanelHead"><div><small>CENTRAL SYNTHESIS</small><h2>Consensus Engine</h2></div></div>
     <div className="consensusRing"><strong>{pct(data?.consensus?.confidence)}</strong><span>confidence</span></div>
     <div className="consensusRows"><div><span>LONG</span><b className="up">{data?.consensus?.long??0}</b></div><div><span>SHORT</span><b className="down">{data?.consensus?.short??0}</b></div><div><span>AGREEMENT</span><b>{pct(data?.consensus?.agreement)}</b></div></div>
     <div className="dissent">{(data?.consensus?.dissent||[]).slice(0,5).map((x:any)=><div key={x.id}><span>{x.id}</span><b className={directionClass(x.direction)}>{x.direction}</b><em>{x.score}</em></div>)}</div>
    </section>
    <section className="aiPanel">
     <div className="aiPanelHead"><div><small>VALIDATION LAYER</small><h2>Warnings & Data</h2></div></div>
     <div className="validation"><div><span>Data</span><b>{data?.dataValid?'VALID':'LIMITED'}</b></div><div><span>News</span><b>{data?.newsImpact?.level||'NONE'}</b></div><div><span>Timeframes</span><b>{data?.multiTimeframe?.alignment||'—'}</b></div></div>
     {(data?.warnings||[]).slice(0,6).map((w,i)=><p className="bullet" key={i}>{w}</p>)}
    </section>
   </aside>
  </section>

  <section className="aiPanel aiChatPanel">
   <div className="aiPanelHead"><div><small>DIRECT INTERACTION</small><h2>DRO AI</h2></div><span>LIVE CONTEXT</span></div>
   <div className="chatHost"><AIChat symbol={symbol} interval={interval} context={context} fa={fa}/></div>
  </section>
  <footer className="aiFooter">MARKET/INTEL · FLI ADVANCED MARKET INTELLIGENCE AI · informational intelligence only</footer>
 </main>
}
