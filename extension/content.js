(() => {
  if (window.__MARKET_INTEL__) return;
  window.__MARKET_INTEL__ = true;
  const root=document.createElement('div');
  root.id='market-intel-overlay';
  root.innerHTML=`<button id="mi-btn">MI</button><div id="mi-panel" hidden><b>MARKET/INTEL</b><span id="mi-symbol">Chart detected</span><span id="mi-state">Click scan</span><button id="mi-scan">Deep Scan</button></div>`;
  const style=document.createElement('style'); style.textContent=`#market-intel-overlay{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:12px system-ui;color:#fff}#mi-btn,#mi-panel{background:#080c10;border:1px solid #2b3935;border-radius:12px;box-shadow:0 12px 35px #0008}#mi-btn{width:44px;height:44px;color:#61e890;font-weight:900;cursor:pointer}#mi-panel{width:260px;padding:14px;display:grid;gap:9px}#mi-panel span{color:#93a0af}#mi-scan{background:#14251b;color:#9bf0b4;border:1px solid #3a6a4a;border-radius:8px;padding:8px;cursor:pointer}`;document.documentElement.appendChild(style);document.body.appendChild(root);
  const btn=root.querySelector('#mi-btn'),panel=root.querySelector('#mi-panel'),scan=root.querySelector('#mi-scan'),state=root.querySelector('#mi-state'),symbol=root.querySelector('#mi-symbol');
  btn.onclick=()=>panel.hidden=!panel.hidden;
  function detect(){const text=document.title+' '+location.pathname;const m=text.match(/(?:BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK)[-_\/]?(?:USDT|USD)?/i);return m?m[0].toUpperCase():'Unknown symbol';}
  scan.onclick=()=>{symbol.textContent=detect();state.textContent='Requesting live intelligence…';chrome.runtime.sendMessage({type:'MARKET_INTEL_ANALYZE'},r=>{if(chrome.runtime.lastError||!r?.ok){state.textContent='Core unavailable — no fabricated result.';return}const i=r.data?.intelligence;state.textContent=i?`${i.direction} · ${i.confidence}% confidence · ${i.regime}`:'No validated result';});};
})();
