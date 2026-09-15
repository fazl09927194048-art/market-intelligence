const DEFAULT_API = 'https://market-intelligence-840b.onrender.com';
const REQUEST_TIMEOUT = 7000;
const CACHE_TTL = 5000;
const STALE_TTL = 60000;
const METRICS_TTL = 15000;
const cache = new Map();
const lastGood = new Map();
const inFlight = new Map();
const metricsCache = new Map();

function cleanSymbol(value){
  const s=String(value||'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return s.endsWith('USDT')?s:`${s}USDT`;
}

async function getApiBase(){
  const stored=await chrome.storage.local.get(['apiBase']);
  return String(stored.apiBase||DEFAULT_API).replace(/\/$/,'');
}

async function fetchJson(url,init={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT);
  try{
    const response=await fetch(url,{...init,cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','Content-Type':'application/json',...(init.headers||{})}});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||`Core ${response.status}`);
    if(!data||typeof data!=='object')throw new Error('Core returned invalid JSON');
    return data;
  }finally{clearTimeout(timer);}
}

async function runLoop(symbol,interval,context={},force=false){
  const normalized=cleanSymbol(symbol);
  const normalizedInterval=String(interval||'15m');
  const key=`${normalized}:${normalizedInterval}`;
  const now=Date.now();
  const hit=cache.get(key);
  if(!force&&hit&&now-hit.at<CACHE_TTL){
    return {...hit.data,_cache:{state:'fresh',ageMs:now-hit.at}};
  }
  if(!force){
    const pending=inFlight.get(key);
    if(pending){
      const data=await pending;
      return {...data,_cache:{state:'fresh',ageMs:Date.now()-Number(data?._serverAt||now)}};
    }
  }
  const request=(async()=>{
    const base=await getApiBase();
    const params=new URLSearchParams({symbol:normalized,interval:normalizedInterval});
    if(Number.isFinite(context.pagePrice)&&context.pagePrice>0)params.set('pagePrice',String(context.pagePrice));
    if(context.observedAt)params.set('observedAt',String(context.observedAt));
    if(context.extraction)params.set('extraction',String(context.extraction));
    try{
      const data=await fetchJson(`${base}/api/loop?${params.toString()}`);
      const at=Date.now();
      cache.set(key,{at,data});
      lastGood.set(key,{at,data});
      return {...data,_serverAt:at};
    }catch(error){
      const stale=lastGood.get(key);
      if(stale&&Date.now()-stale.at<=STALE_TTL){
        return {...stale.data,_cache:{state:'stale',ageMs:Date.now()-stale.at,error:String(error?.message||error)}};
      }
      throw error;
    }finally{
      inFlight.delete(key);
    }
  })();
  inFlight.set(key,request);
  const data=await request;
  if(data?._cache?.state==='stale')return data;
  const ageMs=Math.max(0,Date.now()-Number(data?._serverAt||Date.now()));
  const {_serverAt,...cleanData}=data||{};
  return {...cleanData,_cache:{state:'fresh',ageMs}};
}

async function forecastMetrics(symbol){
  const normalized=cleanSymbol(symbol);
  const hit=metricsCache.get(normalized);
  if(hit&&Date.now()-hit.at<METRICS_TTL)return hit.data;
  const base=await getApiBase();
  const params=new URLSearchParams({symbol:normalized});
  const data=await fetchJson(`${base}/api/forecast-metrics?${params.toString()}`);
  metricsCache.set(normalized,{at:Date.now(),data});
  return data;
}

async function aiChat(message,context){
  const base=await getApiBase();
  return fetchJson(`${base}/api/chat`,{method:'POST',body:JSON.stringify({message:String(message||'').slice(0,8000),context:JSON.stringify(context||{}).slice(0,16000)})});
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(!message?.type)return;
  (async()=>{
    const symbol=cleanSymbol(message.symbol);
    if(message.type==='SET_API_BASE'){
      const apiBase=String(message.apiBase||DEFAULT_API).replace(/\/$/,'');
      if(!/^https:\/\//i.test(apiBase))throw new Error('API base must use HTTPS');
      await chrome.storage.local.set({apiBase});
      sendResponse({ok:true,apiBase});
      return;
    }
    if(message.type==='PING_CORE'){
      const base=await getApiBase();
      const data=await fetchJson(`${base}/api/health`);
      sendResponse({ok:true,data});
      return;
    }
    if(message.type==='MARKET_INTEL_LOOP'){
      const interval=String(message.interval||'15m');
      const context=message.chartContext&&typeof message.chartContext==='object'?message.chartContext:{};
      const data=await runLoop(symbol,interval,context,Boolean(message.force));
      sendResponse({ok:true,data,symbol,cached:data?._cache?.state==='fresh'&&!message.force:false,cacheState:data?._cache?.state||'unknown':'unknown'});
      return;
    }
    if(message.type==='GET_FORECAST_METRICS'){
      const data=await forecastMetrics(symbol);
      sendResponse({ok:true,metrics:data?.metrics??null,enabled:Boolean(data?.enabled)});
      return;
    }
    if(message.type==='AI_CHAT'){
      const data=await aiChat(message.message,message.context);
      sendResponse({ok:true,text:data?.text||'',model:data?.model||null});
      return;
    }
    sendResponse({ok:false,error:'Unknown extension message'});
  })().catch(error=>sendResponse({ok:false,symbol:cleanSymbol(message.symbol),error:String(error?.message||error)}));
  return true;
});
