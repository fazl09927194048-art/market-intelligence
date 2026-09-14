(() => {
  if (window.__MARKET_INTEL__) return;
  window.__MARKET_INTEL__ = true;

  const root = document.createElement('div');
  root.id = 'market-intel-overlay';
  root.innerHTML = `
    <button id="mi-btn" aria-label="Open Market Intelligence">MI</button>
    <section id="mi-panel" hidden>
      <header><b>MARKET/INTEL</b><button id="mi-close">×</button></header>
      <div class="mi-symbol" id="mi-symbol">Detecting…</div>
      <div class="mi-price" id="mi-price">—</div>
      <div class="mi-status" id="mi-status">Connecting live stream…</div>
      <div class="mi-grid">
        <div><small>Signal</small><strong id="mi-signal">—</strong></div>
        <div><small>Forecast</small><strong id="mi-forecast">—</strong></div>
        <div><small>Consensus</small><strong id="mi-consensus">—</strong></div>
        <div><small>Confidence</small><strong id="mi-confidence">—</strong></div>
        <div><small>Regime</small><strong id="mi-regime">—</strong></div>
        <div><small>Data</small><strong id="mi-data">—</strong></div>
      </div>
      <div id="mi-event" hidden></div>
      <div class="mi-actions"><button id="mi-scan">Deep Scan</button><button id="mi-coach">AI Coach</button></div>
      <div class="mi-actions"><button id="mi-refresh">Refresh</button><button id="mi-details-btn">Details</button></div>
      <div id="mi-details" hidden></div>
    </section>`;

  const style = document.createElement('style');
  style.textContent = `
    #market-intel-overlay{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:12px system-ui,sans-serif;color:#eef5f1}
    #mi-btn,#mi-panel{background:#080c10;border:1px solid #2b3935;border-radius:14px;box-shadow:0 16px 45px #0009}
    #mi-btn{width:48px;height:48px;color:#7ff2a5;font-weight:900;cursor:pointer}
    #mi-panel{width:350px;padding:14px;display:grid;gap:10px;backdrop-filter:blur(14px)}
    #mi-panel header{display:flex;justify-content:space-between;align-items:center;color:#7ff2a5}
    #mi-close{background:none;border:0;color:#89958f;font-size:20px;cursor:pointer}
    .mi-symbol,.mi-status{color:#93a0af}.mi-price{font-size:25px;font-weight:850}.mi-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
    .mi-grid div{padding:9px;border:1px solid #24312d;border-radius:9px;background:#0c1210}.mi-grid small{display:block;color:#77847e;margin-bottom:3px}.mi-grid strong{font-size:12px}
    .mi-actions{display:flex;gap:7px}.mi-actions button{flex:1;border:1px solid #3a6a4a;border-radius:9px;padding:9px;background:#14251b;color:#9bf0b4;cursor:pointer}
    #mi-details{white-space:pre-wrap;line-height:1.5;color:#bdc8c2;max-height:260px;overflow:auto;border-top:1px solid #26332f;padding-top:9px}
    #mi-event{padding:9px;border:1px solid #6a4a2b;border-radius:9px;background:#17120d;color:#ffd39a;line-height:1.35}
  `;
  document.documentElement.appendChild(style); document.body.appendChild(root);

  const $ = id => root.querySelector(id);
  const btn=$('#mi-btn'),panel=$('#mi-panel'),close=$('#mi-close'),scan=$('#mi-scan'),coach=$('#mi-coach'),refresh=$('#mi-refresh'),detailsBtn=$('#mi-details-btn');
  const symbolEl=$('#mi-symbol'),price=$('#mi-price'),status=$('#mi-status'),eventEl=$('#mi-event');
  let currentSymbol=null,refreshTimer=null,pageWatchTimer=null,lastPagePrice=null;

  function normalizeSymbol(raw){
    if(!raw)return null;
    const value=String(raw).toUpperCase().replace(/\s+/g,'').replace(/[-_/:]/g,'').replace(/^(BINANCE|KUCOIN|TRADINGVIEW)/,'');
    const match=value.match(/([A-Z0-9]{2,15})(USDT|USDC|BUSD|USD|PERP)/);
    if(match)return `${match[1]}USDT`.replace(/PERPUSDT$/,'USDT');
    return null;
  }

  function detect(){
    const urlText=`${location.hostname} ${location.pathname} ${location.search}`;
    const titleText=document.title||'';
    const candidates=[
      urlText.match(/(?:symbol=|pair=|market=)([A-Za-z0-9_-]+)/i)?.[1],
      location.pathname.match(/(?:spot|futures|perpetual|symbols?)\/([A-Za-z0-9_-]+)/i)?.[1],
      titleText.match(/[A-Za-z0-9]{2,15}[-_\/]?(?:USDT|USD|PERP)/i)?.[0],
      document.body.innerText.match(/[A-Za-z0-9]{2,15}[-_\/]?(?:USDT|USD|PERP)/i)?.[0]
    ];
    for(const candidate of candidates){const symbol=normalizeSymbol(candidate);if(symbol)return symbol;}
    return 'BTCUSDT';
  }

  function extractPagePrice(){
    const selectors=['[data-testid*="price"]','[class*="price"]','[class*="Price"]','[data-test*="price"]','[aria-label*="price" i]'];
    for(const selector of selectors){for(const node of document.querySelectorAll(selector)){const text=String(node.textContent||'').replace(/,/g,'').replace(/\s/g,'');const match=text.match(/\$?(\d+(?:\.\d+)?)/);const value=match?Number(match[1]):NaN;if(Number.isFinite(value)&&value>0)return value;}}
    return null;
  }

  function setSymbol(next,notifyStream=true){
    const normalized=normalizeSymbol(next)||'BTCUSDT';
    if(normalized===currentSymbol)return;
    currentSymbol=normalized;symbolEl.textContent=currentSymbol;
    if(notifyStream)window.marketIntelStream?.setSymbol(currentSymbol);
  }

  function renderLoop(data){
    const signal=data?.signal,forecast=data?.forecast,consensus=data?.consensus;
    $('#mi-signal').textContent=signal?.signal||signal?.side||signal?.direction||'NO TRADE';
    $('#mi-forecast').textContent=forecast?.bias||'—';
    $('#mi-consensus').textContent=consensus?.direction||'—';
    $('#mi-confidence').textContent=`${Math.round(signal?.confidence??consensus?.confidence??0)}%`;
    $('#mi-regime').textContent=data?.technical?.structure?.trend||'UNKNOWN';
    $('#mi-data').textContent=signal?.dataFresh===false||data?.dataValid===false?'STALE':data?.dataValid===true?'VALID':'CHECK';
    const analysts=Array.isArray(data?.analysts)?data.analysts:[],events=Array.isArray(data?.events)?data.events:[],news=Array.isArray(data?.news)?data.news:[];
    const breaking=events.find(e=>e.impact==='BREAKING');
    eventEl.hidden=!breaking;
    if(breaking)eventEl.textContent=`⚠ BREAKING · ${breaking.source}\n${breaking.title}`;
    $('#mi-details').textContent=[`Analysts: ${analysts.length}/33`,`Agreement: ${consensus?.agreement??0}%`,`Regime: ${data?.technical?.structure?.trend??'UNKNOWN'}`,`Signal score: ${signal?.score??'n/a'}`,`Entry: ${signal?.entry??'n/a'}`,`Stop: ${signal?.stopLoss??'n/a'}`,`TP: ${(signal?.takeProfits||[]).join(', ')||'n/a'}`,`RR: ${signal?.riskReward??'n/a'}`,`News: ${news.length} · Events: ${events.length}`,`Data fresh: ${signal?.dataFresh===true?'YES':'NO'}`,`Warnings: ${(data?.warnings||[]).join(' | ')||'none'}`].join('\n');
  }

  function request(force=false,mode='scan'){
    const current=detect();setSymbol(current);status.textContent=mode==='coach'?'AI Coach analyzing…':'33 analysts analyzing…';
    chrome.runtime.sendMessage({type:'MARKET_INTEL_LOOP',symbol:current,interval:'15m',force},response=>{
      if(chrome.runtime.lastError||!response?.ok){status.textContent='Core unavailable — no fabricated result.';return;}
      renderLoop(response.data);const c=response.data?.consensus;
      status.textContent=`${c?.direction||'NEUTRAL'} · ${c?.confidence??0}% · ${response.cached?'cached':'fresh'} cycle`;
      $('#mi-details').hidden=false;
      if(mode==='coach')$('#mi-details').textContent+='\n\nCoach: follow evidence, respect invalidation, and avoid trading when data quality is insufficient.';
    });
  }

  function startAutoRefresh(){clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!panel.hidden)request(false,'scan');},30000);}
  function startPageWatch(){clearInterval(pageWatchTimer);pageWatchTimer=setInterval(()=>{const detected=detect();if(detected!==currentSymbol&&panel.hidden===false)setSymbol(detected);const pagePrice=extractPagePrice();if(Number.isFinite(pagePrice)&&pagePrice!==lastPagePrice){lastPagePrice=pagePrice;if(!window.marketIntelStream)price.textContent=pagePrice.toLocaleString();}},2500);}

  btn.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){setSymbol(detect());request(false);}};close.onclick=()=>{panel.hidden=true;};scan.onclick=()=>request(true,'scan');coach.onclick=()=>request(true,'coach');refresh.onclick=()=>request(true,'scan');detailsBtn.onclick=()=>{$('#mi-details').hidden=!$('#mi-details').hidden;};

  window.addEventListener('market-intel-stream',event=>{const data=event.detail||{};if(data.status){status.textContent=data.status==='live'?'● Live market stream':`Stream: ${data.status}`;return;}if(data.type==='ticker'){setSymbol(data.symbol,false);price.textContent=Number.isFinite(data.price)?Number(data.price).toLocaleString():'—';status.textContent=`${data.change24hPct>=0?'+':''}${Number(data.change24hPct||0).toFixed(2)}% · live`;}});
  setSymbol(detect());startAutoRefresh();startPageWatch();
})();
