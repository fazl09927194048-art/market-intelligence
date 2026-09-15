'use client';
import React,{useEffect,useMemo,useState} from 'react';
import styles from './MarketChart.module.css';
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number;trades?:number};
type Trade={price:number;qty:number;value:number;time:number;id:number;side:'BUY'|'SELL'};
type Props={symbol:string;interval:string;fa?:boolean};
const money=(v:number)=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{maximumFractionDigits:v>=100?2:v>=1?4:8}).format(v):'—';
const toCandle=(row:any):Candle|null=>{if(!row||typeof row!=='object')return null;const n=[row.time,row.open,row.high,row.low,row.close,row.volume,row.trades].map(Number);if(n.slice(0,6).some(x=>!Number.isFinite(x)))return null;return{time:n[0],open:n[1],high:n[2],low:n[3],close:n[4],volume:n[5],trades:Number.isFinite(n[6])?n[6]:undefined};};
const streamInterval=(v:string)=>v==='1d'?'1d':v==='4h'?'4h':v==='1h'?'1h':v==='5m'?'5m':'15m';

export default function MarketChart({symbol,interval,fa=false}:Props){
 const [candles,setCandles]=useState<Candle[]>([]),[trades,setTrades]=useState<Trade[]>([]),[book,setBook]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hover,setHover]=useState<Candle|null>(null),[live,setLive]=useState(false),[feedAge,setFeedAge]=useState<number|null>(null),[reconnects,setReconnects]=useState(0);
 useEffect(()=>{
  let dead=false;let ws:WebSocket|null=null;let reconnectTimer:number|undefined;let staleTimer:number|undefined;let heartbeatTimer:number|undefined;let backoff=1000;let lastMessage=0;
  const loadCandles=async()=>{
   try{
    let r=await fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=100`,{cache:'no-store'});
    let data:any=null;
    if(r.ok)data=await r.json();
    let parsed=((data?.candles||[]).map(toCandle).filter(Boolean) as Candle[]);
    if(!parsed.length){
     const direct=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol.toUpperCase())}&interval=${encodeURIComponent(interval)}&limit=100`,{cache:'no-store'});
     if(!direct.ok)throw new Error(`Klines ${direct.status}`);
     const rows=await direct.json();parsed=rows.map((x:any[])=>toCandle({time:x[0],open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5],trades:x[8]})).filter(Boolean) as Candle[];
    }
    if(!parsed.length)throw new Error(fa?'کندل دریافت نشد':'No candlestick data');
    if(!dead){setCandles(parsed.slice(-100));setLoading(false);setError('')}
   }catch(e){if(!dead){setLoading(false);setError(e instanceof Error?e.message:(fa?'داده کندلی در دسترس نیست':'Candles unavailable'))}}
  };
  const loadSecondary=async()=>{
   const results=await Promise.allSettled([fetch(`/api/orderbook?symbol=${encodeURIComponent(symbol)}&limit=20`,{cache:'no-store'}),fetch(`/api/trades?symbol=${encodeURIComponent(symbol)}&limit=80`,{cache:'no-store'})]);
   if(dead)return;
   const [ob,tr]=results;
   if(ob.status==='fulfilled'&&ob.value.ok){try{setBook(await ob.value.json())}catch{}}
   if(tr.status==='fulfilled'&&tr.value.ok){try{const td=await tr.value.json();setTrades(Array.isArray(td.trades)?td.trades:[])}catch{}}
  };
  const loadSnapshot=()=>{void loadCandles();void loadSecondary()};
  const scheduleReconnect=()=>{if(dead||reconnectTimer)return;setLive(false);const wait=backoff;backoff=Math.min(backoff*2,15000);setReconnects(v=>v+1);reconnectTimer=window.setTimeout(()=>{reconnectTimer=undefined;connect()},wait)};
  const connect=()=>{if(dead)return;try{ws?.close()}catch{};setLive(false);const s=symbol.toLowerCase(),iv=streamInterval(interval);const streams=[`${s}@kline_${iv}`,`${s}@aggTrade`,`${s}@depth20@100ms`,`${s}@bookTicker`].join('/');try{ws=new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`)}catch{scheduleReconnect();return}
   ws.onopen=()=>{if(dead)return;backoff=1000;lastMessage=Date.now();setLive(true);setError('');setFeedAge(0)};
   ws.onmessage=e=>{if(dead)return;lastMessage=Date.now();setFeedAge(0);try{const packet=JSON.parse(e.data),d=packet.data||packet,type=d.e,now=Date.now();
    if(type==='kline'&&d.k){const k=d.k,c:Candle={time:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.q),trades:Number(k.n)};if([c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite))setCandles(prev=>{const next=prev.slice(),i=next.findIndex(x=>x.time===c.time);if(i>=0)next[i]=c;else next.push(c);return next.slice(-100)})}
    else if(type==='aggTrade'){const price=Number(d.p),qty=Number(d.q);if(Number.isFinite(price)&&Number.isFinite(qty)&&qty>=0){const t:Trade={price,qty,value:price*qty,time:Number(d.T)||now,id:Number(d.a),side:d.m?'SELL':'BUY'};setTrades(prev=>[...prev,t].slice(-120))}}
    else if((type==='depthUpdate'||type===undefined)&&Array.isArray(d.bids)&&Array.isArray(d.asks)){const bids=d.bids.map((x:any)=>({price:Number(x[0]),quantity:Number(x[1]),value:Number(x[0])*Number(x[1])})).filter((x:any)=>Number.isFinite(x.price)&&Number.isFinite(x.quantity)&&x.price>0),asks=d.asks.map((x:any)=>({price:Number(x[0]),quantity:Number(x[1]),value:Number(x[0])*Number(x[1])})).filter((x:any)=>Number.isFinite(x.price)&&Number.isFinite(x.quantity)&&x.price>0);if(bids.length&&asks.length){const buyValue=bids.reduce((a:number,x:any)=>a+x.value,0),sellValue=asks.reduce((a:number,x:any)=>a+x.value,0),sum=buyValue+sellValue;setBook({bids,asks,buyValue,sellValue,buyPct:sum?buyValue/sum*100:null,sellPct:sum?sellValue/sum*100:null,imbalance:sum?(buyValue-sellValue)/sum*100:null,lastUpdateId:d.u||d.lastUpdateId,source:'Binance WebSocket'})}}
    else if(type==='bookTicker'){setBook((prev:any)=>prev?{...prev,bids:prev.bids?.length?[{price:Number(d.b),quantity:Number(d.B),value:Number(d.b)*Number(d.B)},...prev.bids.slice(1)]:prev.bids,asks:prev.asks?.length?[{price:Number(d.a),quantity:Number(d.A),value:Number(d.a)*Number(d.A)},...prev.asks.slice(1)]:prev.asks}:prev)}catch{}};
   ws.onerror=()=>scheduleReconnect();ws.onclose=()=>scheduleReconnect();
  };
  loadSnapshot();connect();
  heartbeatTimer=window.setInterval(()=>{if(dead)return;const age=lastMessage?Date.now()-lastMessage:999999;setFeedAge(age);if(!ws||ws.readyState!==WebSocket.OPEN||age>20000){try{ws?.close()}catch{};scheduleReconnect();loadSnapshot()}},5000);
  staleTimer=window.setInterval(()=>{if(!dead&&lastMessage&&Date.now()-lastMessage>30000){setLive(false);loadSnapshot()}},10000);
  return()=>{dead=true;if(reconnectTimer)window.clearTimeout(reconnectTimer);if(heartbeatTimer)window.clearInterval(heartbeatTimer);if(staleTimer)window.clearInterval(staleTimer);try{ws?.close()}catch{}};
 },[symbol,interval,fa]);
 const geom=useMemo(()=>{if(!candles.length)return null;const width=1000,height=300,pad=22,min=Math.min(...candles.map(c=>c.low)),max=Math.max(...candles.map(c=>c.high)),range=Math.max(max-min,Math.abs(max)*0.000001),step=(width-pad*2)/candles.length,y=(v:number)=>pad+(max-v)/range*(height-pad*2);return{width,height,min,max,step,y}},[candles]);
 const buy=trades.filter(t=>t.side==='BUY'),sell=trades.filter(t=>t.side==='SELL'),buyVol=buy.reduce((a,t)=>a+t.value,0),sellVol=sell.reduce((a,t)=>a+t.value,0),total=buyVol+sellVol,buyPct=total?buyVol/total*100:0,sellPct=total?sellVol/total*100:0;
 const spread=book?.bids?.[0]&&book?.asks?.[0]?Number(book.asks[0].price)-Number(book.bids[0].price):null;
 const estimatedBuyers=Math.max(1,Math.round(buy.length/4)),estimatedSellers=Math.max(1,Math.round(sell.length/4));
 const status=live?(feedAge!=null&&feedAge>10000?'STALE':'LIVE WS'):(reconnects?'RECONNECTING · REST':'REST FALLBACK');
 return <section className={styles.chart} aria-label="Live crypto trading terminal"><div className={styles.head}><div><b>{symbol.replace('USDT','/USDT')} · {interval}</b><small>{loading?'LOADING CANDLES':error||`${candles.length} OHLC candles · ${status}`}</small></div><div className={styles.value}>{hover?`${money(hover.close)} · H ${money(hover.high)} · L ${money(hover.low)}`:candles.length?money(candles[candles.length-1].close):'—'}</div></div><div className={styles.canvas}>{geom?<svg className={styles.svg} viewBox={`0 0 ${geom.width} ${geom.height}`} width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="Candlestick price chart"><path d={`M ${geom.pad??22} ${geom.y((geom.min+geom.max)/2)} H ${geom.width-(geom.pad??22)}`} className={styles.grid}/>{candles.map((c,i)=>{const x=22+i*geom.step+geom.step/2,up=c.close>=c.open,top=geom.y(Math.max(c.open,c.close)),bottom=geom.y(Math.min(c.open,c.close));return <g key={`${c.time}-${i}`} onMouseEnter={()=>setHover(c)} onMouseLeave={()=>setHover(null)} className={`${styles.candle} ${up?styles.up:styles.down}`}><line x1={x} x2={x} y1={geom.y(c.high)} y2={geom.y(c.low)}/><rect x={x-Math.max(1,geom.step*.32)} y={top} width={Math.max(2,geom.step*.64)} height={Math.max(1,bottom-top)} rx="1"/></g>})}</svg>:!loading?<div className={styles.empty}>{error||'No chart data'}</div>:<div className={styles.loadingChart}>{fa?'در حال دریافت کندل‌ها…':'Loading candlestick data…'}</div>}</div><div className={styles.volume}><div className={styles.volHead}><b>VOLUME FLOW</b><span>{money(total)} · {trades.length} observed trades</span></div><div className={styles.bar}><i style={{width:`${buyPct}%`}}/><em style={{width:`${sellPct}%`}}/></div><div className={styles.volStats}><span>BUY <b>{buyPct.toFixed(1)}%</b> · {money(buyVol)}</span><span>SELL <b>{sellPct.toFixed(1)}%</b> · {money(sellVol)}</span></div></div><div className={styles.stats}><div><small>BUY TRADES</small><b>{buy.length}</b></div><div><small>SELL TRADES</small><b>{sell.length}</b></div><div><small>EST BUYERS*</small><b>~{estimatedBuyers}</b></div><div><small>EST SELLERS*</small><b>~{estimatedSellers}</b></div><div><small>BOOK BUY</small><b>{money(Number(book?.buyValue))}</b></div><div><small>BOOK SELL</small><b>{money(Number(book?.sellValue))}</b></div><div><small>IMBALANCE</small><b>{book?.imbalance==null?'—':`${Number(book.imbalance).toFixed(1)}%`}</b></div><div><small>SPREAD</small><b>{spread==null?'—':money(spread)}</b></div></div><div className={styles.tape}><div className={styles.tapeHead}><b>LIVE TRADE TAPE</b><span>{status}</span></div>{trades.slice(-12).reverse().map((t,i)=><div className={styles.trade} key={`${t.id}-${i}`}><b className={t.side==='BUY'?styles.buy:styles.sell}>{t.side}</b><span>{money(t.price)}</span><span>{money(t.value)}</span><small>{new Date(t.time).toLocaleTimeString()}</small></div>)}</div><div className={styles.note}>{fa?'شناسه کاربران عمومی نیست؛ تعداد خریداران/فروشندگان منحصربه‌فرد قابل مشاهده نیست. برآورد فقط بر اساس معاملات مشاهده‌شده است.':'Exact unique users are not exposed by public exchange data. Estimated buyers/sellers are a heuristic based on observed trades.'}</div><div className={styles.foot}><span>LIVE OHLCV + ORDER FLOW</span><span>Binance public market data · WS first, REST fallback · reconnects {reconnects}</span></div></section>;
}
