(() => {
  if (window.__MARKET_INTEL__) return;
  window.__MARKET_INTEL__ = true;

  const root = document.createElement('div');
  root.id = 'market-intel-overlay';
  root.innerHTML = `
    <button id="mi-btn" aria-label="Open DRO tools" title="DRO — double tap for tools">DRO</button>
    <section id="mi-panel" hidden aria-label="DRO tools">
      <div class="mi-tools">
        <button data-tool="signal">SIG</button><button data-tool="chart">CHT</button><button data-tool="mtf">MTF</button>
        <button data-tool="orderbook">BOOK</button><button data-tool="derivatives">DER</button><button data-tool="news">NEWS</button>
        <button data-tool="risk">RISK</button><button data-tool="ai">AI</button><button id="mi-scan">SCAN</button>
      </div>
      <div id="mi-mini"><b id="mi-symbol">BTCUSDT</b><span id="mi-price">—</span></div>
      <div class="mi-status"><span id="mi-signal">—</span><span id="mi-confidence">—</span><span id="mi-regime">—</span></div>
      <div id="mi-output">Choose a tool.</div>
    </section>`;

  const style = document.createElement('style');
  style.textContent = `
    #market-intel-overlay{position:fixed;left:auto;top:auto;right:12px;bottom:12px;z-index:2147483647;font:11px/1.3 system-ui,sans-serif;color:#eef5f1;touch-action:none;user-select:none}
    #mi-btn{width:44px;height:36px;padding:0;border:1px solid #31523f;border-radius:11px;background:#080c10;color:#7ff2a5;font-weight:950;font-size:11px;letter-spacing:.4px;box-shadow:0 8px 28px #0009;cursor:grab;touch-action:none}
    #mi-btn:active{cursor:grabbing}
    #mi-panel{width:104px;margin:0 0 5px auto;padding:5px;background:#080c10;border:1px solid #2b3935;border-radius:11px;box-shadow:0 14px 35px #000b;backdrop-filter:blur(14px)}
    .mi-tools{display:grid;grid-template-columns:repeat(3,28px);gap:3px;justify-content:end}
    .mi-tools button{width:28px;height:25px;padding:0;border:1px solid #294936;border-radius:6px;background:#101a14;color:#a8efbc;font-size:7px;font-weight:800;cursor:pointer}
    .mi-tools button:active{transform:scale(.94)}
    #mi-mini{display:flex;justify-content:space-between;gap:5px;margin-top:4px;padding:4px;border-top:1px solid #202d27;color:#b9c5be;font-size:8px}
    #mi-price{font-weight:800;color:#eef5f1;max-width:65px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mi-status{display:flex;justify-content:space-between;gap:3px;font-size:7px;color:#87968d}
    .mi-status span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #mi-output{display:none;margin-top:4px;padding:5px;border-top:1px solid #202d27;color:#b9c5be;white-space:pre-wrap;line-height:1.35;user-select:text;max-height:120px;overflow:auto;font-size:8px}
    #mi-panel.mi-detail{width:210px}.mi-detail #mi-output{display:block}
  `;
  document.documentElement.appendChild(style);
  (document.body || document.documentElement).appendChild(root);

  const $ = id => root.querySelector(id);
  const btn = $('#mi-btn');
  const panel = $('#mi-panel');
  let currentSymbol = null;
  let livePrice = null;
  let lastData = null;
  let dragging = false;
  let moved = false;
  let sx = 0, sy = 0, sl = 0, st = 0;
  let lastTap = 0;
  let requestTimer = null;
  let lastBridge = '';

  function normalize(raw){
    const v=String(raw||'').toUpperCase().replace(/\s+/g,'').replace(/[-_/:]/g,'').replace(/^(BINANCE|KUCOIN|TRADINGVIEW)/,'');
    const m=v.match(/([A-Z0-9]{2,15})(USDT|USDC|BUSD|USD|PERP)/);
    return m?`${m[1]}USDT`:'BTCUSDT';
  }
  function detect(){
    const s=`${location.hostname} ${location.pathname} ${location.search} ${document.title||''}`;
    return normalize(s.match(/[A-Za-z0-9]{2,15}[-_/]?(?:USDT|USDC|USD|PERP)/i)?.[0]);
  }
  function interval(){
    const s=`${location.pathname} ${location.search} ${document.title||''}`;
    return s.match(/(?:^|[?=&\s/_-])(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)(?:$|[?&#\s/_-])/i)?.[1]||'15m';
  }
  function pagePrice(){
    for(const q of ['[data-testid*="price"]','[class*="price"]','[class*="Price"]','[data-test*="price"]','[aria-label*="price" i]']){
      for(const n of document.querySelectorAll(q)){
        const m=String(n.textContent||'').replace(/,/g,'').match(/\$?(\d+(?:\.\d+)?)/);
        const x=m?Number(m[1]):NaN;
        if(Number.isFinite(x)&&x>0)return x;
      }
    }
    return null;
  }
  async function savePos(){
    const r=root.getBoundingClientRect();
    await chrome.storage.local.set({droPosition:{left:r.left,top:r.top}});
  }
  async function loadPos(){
    try{
      const x=await chrome.storage.local.get('droPosition');
      const p=x?.droPosition;
      if(p&&Number.isFinite(p.left)&&Number.isFinite(p.top)){
        root.style.left=Math.max(2,p.left)+'px'; root.style.top=Math.max(2,p.top)+'px'; root.style.right='auto'; root.style.bottom='auto';
      }
    }catch{}
  }
  function clamp(){
    const r=root.getBoundingClientRect();
    const x=Math.max(2,Math.min(innerWidth-r.width-2,r.left));
    const y=Math.max(2,Math.min(innerHeight-r.height-2,r.top));
    root.style.left=x+'px'; root.style.top=y+'px'; root.style.right='auto'; root.style.bottom='auto';
  }
  function startDrag(e){
    dragging=true;moved=false;sx=e.clientX;sy=e.clientY;
    const r=root.getBoundingClientRect();sl=r.left;st=r.top;
    try{btn.setPointerCapture(e.pointerId)}catch{}
  }
  function moveDrag(e){
    if(!dragging)return;
    const dx=e.clientX-sx,dy=e.clientY-sy;
    if(Math.abs(dx)+Math.abs(dy)>5)moved=true;
    root.style.left=Math.max(2,Math.min(innerWidth-root.offsetWidth-2,sl+dx))+'px';
    root.style.top=Math.max(2,Math.min(innerHeight-root.offsetHeight-2,st+dy))+'px';
    root.style.right='auto';root.style.bottom='auto';
  }
  function finishDrag(){
    if(!dragging)return; dragging=false;
    if(moved)savePos();
  }
  function openTools(){panel.hidden=false;panel.classList.remove('mi-detail')}
  function closeTools(){panel.hidden=true;panel.classList.remove('mi-detail')}
  function handleTap(){
    if(moved)return;
    const now=Date.now();
    if(now-lastTap<360){openTools();request(false);lastTap=0;return;}
    lastTap=now;
    setTimeout(()=>{if(Date.now()-lastTap>=350){openTools();lastTap=0}},370);
  }
  btn.addEventListener('pointerdown',startDrag);
  btn.addEventListener('pointermove',moveDrag);
  btn.addEventListener('pointerup',finishDrag);
  btn.addEventListener('pointerup',handleTap);
  btn.addEventListener('dblclick',e=>{e.preventDefault();openTools();request(false)});

  function compactSnapshot(data){
    const d=data||{};
    const md=d.marketData||{}, micro=md.microstructure||{}, der=md.derivatives||{}, fu=md.futures||{};
    return {
      source:'DRO-extension',symbol:currentSymbol,interval:interval(),pagePrice:livePrice??pagePrice(),
      signal:d.signal||null,forecast:d.forecast||null,consensus:d.consensus||null,risk:d.risk||null,
      multiTimeFrame:d.multiTimeframe||null,chartPatterns:d.chartPatterns||null,
      microstructure:{spreadPct:micro.spreadPct,orderBookImbalance:micro.orderBookImbalance,deltaNotional:micro.deltaNotional,tradeCount:micro.tradeCount},
      derivatives:{basisPct:der.basisPct,fundingRate:fu.fundingRate,openInterest:fu.openInterest},
      news:Array.isArray(d.news)?d.news.slice(0,5):[],events:Array.isArray(d.events)?d.events.slice(0,5):[],
      warnings:Array.isArray(d.warnings)?d.warnings.slice(0,4):[],observedAt:new Date().toISOString(),extraction:'extension'
    };
  }
  function bridge(data){
    const snap=compactSnapshot(data);
    const encoded=JSON.stringify(snap);
    if(encoded===lastBridge)return;
    lastBridge=encoded;
    document.documentElement.setAttribute('data-dro-extension-context',encoded);
    document.documentElement.setAttribute('data-dro-extension','on');
    window.dispatchEvent(new CustomEvent('dro-extension-context',{detail:snap}));
  }
  function render(data){
    lastData=data;
    const s=data?.signal||{},c=data?.consensus||{},t=data?.technical?.structure||{};
    $('#mi-symbol').textContent=currentSymbol||'—';
    $('#mi-signal').textContent=s.signal||'NO TRADE';
    $('#mi-confidence').textContent=`${Math.round(s.confidence??c.confidence??0)}%`;
    $('#mi-regime').textContent=t.trend||data?.forecast?.bias||'—';
    $('#mi-price').textContent=Number.isFinite(livePrice)?livePrice.toLocaleString():(data?.marketData?.spot?.price??'—');
    bridge(data);
  }
  function toolView(tool){
    const d=lastData||{},s=d.signal||{},f=d.forecast||{},r=d.risk||{},m=d.multiTimeframe||{},md=d.marketData||{},micro=md.microstructure||{},der=md.derivatives||{},fu=md.futures||{};
    const views=(m.views||[]).slice(0,4).map(v=>`${v.interval}: ${v.trend}/${v.momentum} ${v.confidence??0}%`).join('\n');
    const map={
      signal:`${s.signal||'NO TRADE'} · ${Math.round(s.confidence??0)}%\nEntry ${s.entry??'—'} · SL ${s.stopLoss??'—'}\nTP ${(s.takeProfits||[]).slice(0,2).join(', ')||'—'}`,
      chart:`${currentSymbol} · ${interval()}\nLive ${livePrice??md.spot?.price??'—'}\nChart data is live from the intelligence core.`,
      mtf:`${m.alignment||'INSUFFICIENT'} · ${m.score??0}%\n${views||'No MTF data'}`,
      orderbook:`Imbalance ${micro.orderBookImbalance==null?'—':(micro.orderBookImbalance*100).toFixed(1)+'%'}\nSpread ${micro.spreadPct==null?'—':micro.spreadPct.toFixed(3)+'%'}\nDelta ${micro.deltaNotional??'—'}`,
      derivatives:`Basis ${der.basisPct??'—'}%\nFunding ${fu.fundingRate??'—'}\nOI ${fu.openInterest??'—'}`,
      news:`${(d.news||[]).slice(0,4).map(n=>n.title||n.source).join('\n')||'No fresh news'}`,
      risk:`${r.level||'—'} · ${r.score??0}/100\n${r.positionRisk||'—'}\n${(d.warnings||[]).slice(0,2).join('\n')}`,
      ai:'AI Coach receives this DRO snapshot. Open AI chat and ask why the current signal exists.'
    };
    panel.classList.add('mi-detail');
    $('#mi-output').textContent=map[tool]||'Ready';
  }
  root.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>toolView(b.dataset.tool)));
  $('#mi-scan').addEventListener('click',()=>{panel.classList.add('mi-detail');$('#mi-output').textContent='Running Deep Scan…';request(true)});

  function request(force=false){
    const symbol=detect();
    if(symbol!==currentSymbol){currentSymbol=symbol;window.marketIntelStream?.setSymbol(symbol)}
    const ctx={source:'browser',symbol:currentSymbol,interval:interval(),pagePrice:livePrice??pagePrice(),observedAt:new Date().toISOString(),extraction:'extension'};
    chrome.runtime.sendMessage({type:'MARKET_INTEL_LOOP',symbol:currentSymbol,interval:ctx.interval,force,chartContext:ctx},r=>{
      if(chrome.runtime.lastError||!r?.ok){$('#mi-output').textContent='Core unavailable — no fabricated result.';return;}
      render(r.data);
      if(force)$('#mi-output').textContent='Deep Scan complete. Select a tool.';
    });
  }
  window.addEventListener('market-intel-stream',e=>{
    const d=e.detail||{};
    if(d.symbol&&currentSymbol&&d.symbol!==currentSymbol)return;
    if(d.type==='ticker'||d.type==='trade'){
      const p=Number(d.price);
      if(Number.isFinite(p)&&p>0){livePrice=p;$('#mi-price').textContent=p.toLocaleString();if(lastData)bridge(lastData)}
    }
    if(d.type==='depth'){
      if(requestTimer)clearTimeout(requestTimer);
      requestTimer=setTimeout(()=>{requestTimer=null;if(!panel.hidden)request(false)},1500);
    }
  });

  setInterval(()=>{
    const s=detect();
    if(s!==currentSymbol){currentSymbol=s;window.marketIntelStream?.setSymbol(s);if(!panel.hidden)request(false)}
  },1500);
  loadPos().then(clamp);
  window.addEventListener('resize',clamp);
  currentSymbol=detect();
  window.marketIntelStream?.setSymbol(currentSymbol);
  setTimeout(()=>{bridge(lastData||{});},500);
})();