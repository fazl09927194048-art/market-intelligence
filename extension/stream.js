(() => {
  if (window.__MARKET_INTEL_STREAM__) return;
  window.__MARKET_INTEL_STREAM__ = true;

  const state = {
    ws: null, symbol: null, attempt: 0, timer: null, heartbeat: null,
    lastEventTime: 0, lastUpdateId: 0, generation: 0,
    latest: { ticker: null, trade: null, depth: null },
    publishTimer: null, dirty: new Set(),
  };
  const assets=['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','AVAX','LINK','DOT','SUI','TON','TRX','LTC','MATIC','ATOM','NEAR','APT','ARB','OP','PEPE','UNI','AAVE'];

  function normalizeSymbol(value){
    const clean=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    for(const asset of assets){
      if(clean.includes(asset+'USDT')||clean.includes(asset+'USDC')||clean.includes(asset+'USD')||clean===asset||clean.startsWith(asset+'PERP')) return asset+'USDT';
    }
    const m=clean.match(/([A-Z0-9]{2,15})(USDT|USDC|BUSD|USD|PERP)/);
    return m?m[1]+'USDT':'BTCUSDT';
  }
  function emit(payload){window.dispatchEvent(new CustomEvent('market-intel-stream',{detail:payload}));}
  function clearTimers(){
    if(state.timer)clearTimeout(state.timer); if(state.heartbeat)clearTimeout(state.heartbeat); if(state.publishTimer)clearTimeout(state.publishTimer);
    state.timer=null; state.heartbeat=null; state.publishTimer=null;
  }
  function close(){clearTimers(); if(state.ws){try{state.ws.close(1000,'switch');}catch{}} state.ws=null; state.dirty.clear();}
  function scheduleReconnect(g){
    if(state.timer||g!==state.generation)return;
    const delay=Math.min(30000,1000*(2**Math.min(state.attempt,5))*(0.85+Math.random()*0.3));
    state.attempt+=1;
    state.timer=setTimeout(()=>{state.timer=null;if(g===state.generation)connect(state.symbol);},delay);
  }
  function armHeartbeat(g){
    if(state.heartbeat)clearTimeout(state.heartbeat);
    state.heartbeat=setTimeout(()=>{if(g!==state.generation)return;emit({type:'status',status:'stale',symbol:state.symbol});try{state.ws?.close();}catch{}},15000);
  }
  function publish(){
    state.publishTimer=null;
    if(!state.dirty.size)return;
    const dirty=[...state.dirty]; state.dirty.clear();
    for(const type of dirty){
      const item=state.latest[type];
      if(item)emit(item);
    }
  }
  function markDirty(type){
    state.dirty.add(type);
    if(state.publishTimer)return;
    // Coalesce bursty Binance messages into one UI update per ~100ms.
    state.publishTimer=setTimeout(publish,100);
  }
  function connect(rawSymbol){
    const symbol=normalizeSymbol(rawSymbol); state.generation+=1; const g=state.generation;
    state.symbol=symbol; close(); state.lastEventTime=0; state.lastUpdateId=0;
    state.latest={ticker:null,trade:null,depth:null};
    const s=symbol.toLowerCase();
    const url=`wss://stream.binance.com:9443/stream?streams=${s}@ticker/${s}@trade/${s}@depth5@100ms`;
    let ws;
    try{ws=new WebSocket(url);}catch(error){emit({type:'status',status:'error',symbol,error:String(error?.message||error)});scheduleReconnect(g);return;}
    state.ws=ws; emit({type:'status',status:'connecting',symbol});
    ws.onopen=()=>{if(g!==state.generation)return;state.attempt=0;emit({type:'status',status:'live',symbol});armHeartbeat(g);};
    ws.onmessage=event=>{
      if(g!==state.generation)return; armHeartbeat(g);
      let packet; try{packet=JSON.parse(event.data);}catch{return;}
      const data=packet?.data; if(!data||typeof data!=='object')return;
      const eventTime=Number(data.E||0),updateId=Number(data.u||data.lastUpdateId||0);
      if(eventTime&&eventTime<state.lastEventTime)return;
      if(updateId&&updateId<state.lastUpdateId)return;
      if(eventTime)state.lastEventTime=eventTime; if(updateId)state.lastUpdateId=updateId;
      if(data.e==='24hrTicker'){
        const p=Number(data.c),change=Number(data.P); if(!Number.isFinite(p))return;
        state.latest.ticker={type:'ticker',symbol,eventTime,price:p,change24hPct:Number.isFinite(change)?change:0,volume24h:Number(data.q)};
        markDirty('ticker');
      }else if(data.e==='trade'){
        const price=Number(data.p),quantity=Number(data.q); if(!Number.isFinite(price)||!Number.isFinite(quantity))return;
        state.latest.trade={type:'trade',symbol,eventTime,tradeId:Number(data.t),price,quantity,buyerMaker:Boolean(data.m)};
        markDirty('trade');
      }else if(data.e==='depthUpdate'){
        state.latest.depth={type:'depth',symbol,eventTime,updateId,bids:Array.isArray(data.b)?data.b:[],asks:Array.isArray(data.a)?data.a:[]};
        markDirty('depth');
      }
    };
    ws.onerror=()=>{if(g===state.generation)emit({type:'status',status:'error',symbol});};
    ws.onclose=()=>{if(g!==state.generation||state.ws!==ws)return;state.ws=null;emit({type:'status',status:'reconnecting',symbol});scheduleReconnect(g);};
  }
  window.marketIntelStream={
    connect, disconnect:close, setSymbol:connect,
    getState:()=>({symbol:state.symbol,connected:state.ws?.readyState===WebSocket.OPEN,lastEventTime:state.lastEventTime,latest:state.latest})
  };
  connect(normalizeSymbol(document.title+' '+location.pathname+' '+location.search));
})();