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
      </div>
      <div class="mi-actions">
        <button id="mi-scan">Deep Scan</button>
        <button id="mi-coach">AI Coach</button>
      </div>
      <div id="mi-details" hidden></div>
    </section>`;

  const style = document.createElement('style');
  style.textContent = `
    #market-intel-overlay{position:fixed;right:18px;bottom:18px;z-index:2147483647;font:12px system-ui,sans-serif;color:#eef5f1}
    #mi-btn,#mi-panel{background:#080c10;border:1px solid #2b3935;border-radius:14px;box-shadow:0 16px 45px #0009}
    #mi-btn{width:48px;height:48px;color:#7ff2a5;font-weight:900;cursor:pointer}
    #mi-panel{width:330px;padding:14px;display:grid;gap:10px;backdrop-filter:blur(14px)}
    #mi-panel header{display:flex;justify-content:space-between;align-items:center;color:#7ff2a5}
    #mi-close{background:none;border:0;color:#89958f;font-size:20px;cursor:pointer}
    .mi-symbol,.mi-status{color:#93a0af}.mi-price{font-size:25px;font-weight:850}.mi-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .mi-grid div{padding:9px;border:1px solid #24312d;border-radius:9px;background:#0c1210}.mi-grid small{display:block;color:#77847e;margin-bottom:3px}.mi-grid strong{font-size:13px}
    .mi-actions{display:flex;gap:7px}.mi-actions button{flex:1;border:1px solid #3a6a4a;border-radius:9px;padding:9px;background:#14251b;color:#9bf0b4;cursor:pointer}
    #mi-details{white-space:pre-wrap;line-height:1.5;color:#bdc8c2;max-height:230px;overflow:auto;border-top:1px solid #26332f;padding-top:9px}
  `;
  document.documentElement.appendChild(style); document.body.appendChild(root);

  const $ = id => root.querySelector(id);
  const btn = $('#mi-btn'), panel = $('#mi-panel'), close = $('#mi-close'), scan = $('#mi-scan'), coach = $('#mi-coach');
  const symbol = $('#mi-symbol'), price = $('#mi-price'), status = $('#mi-status');

  function detect() {
    const text = `${document.title} ${location.pathname} ${location.search}`;
    const m = text.match(/(?:BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK)[-_\/]?(?:USDT|USD)?/i);
    return m ? `${m[0].toUpperCase().replace(/[-\/]USD$/,'USDT')}` : 'BTCUSDT';
  }
  function setSymbol(next) { symbol.textContent = next; window.marketIntelStream?.setSymbol(next); }
  function renderLoop(data) {
    const signal = data?.signal, forecast = data?.forecast, consensus = data?.consensus;
    $('#mi-signal').textContent = signal?.side || signal?.direction || 'NO TRADE';
    $('#mi-forecast').textContent = forecast?.bias || '—';
    $('#mi-consensus').textContent = consensus?.direction || '—';
    $('#mi-confidence').textContent = `${Math.round(signal?.confidence ?? consensus?.confidence ?? 0)}%`;
    const details = $('#mi-details');
    details.textContent = `33 analysts: ${data?.analysts?.length ?? 0}\nAgreement: ${consensus?.agreement ?? 0}%\nRegime: ${data?.technical?.structure?.trend ?? data?.regime ?? 'UNKNOWN'}\nData valid: ${data?.dataValid === true ? 'YES' : 'NO'}\nWarnings: ${(data?.warnings || []).join(' | ') || 'none'}`;
  }
  async function request(type) {
    const current = detect(); setSymbol(current); status.textContent = type === 'coach' ? 'AI Coach analyzing…' : '33 brains analyzing…';
    const message = { type: 'MARKET_INTEL_LOOP', symbol: current, interval: '15m' };
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError || !response?.ok) { status.textContent = 'Core unavailable — no fabricated result.'; return; }
      renderLoop(response.data);
      const c = response.data?.consensus;
      status.textContent = `${c?.direction || 'NEUTRAL'} · ${c?.confidence ?? 0}% · validated cycle`;
      $('#mi-details').hidden = false;
      if (type === 'coach') $('#mi-details').textContent += '\n\nCoach: use the live evidence, respect invalidation, and do not trade when data quality is insufficient.';
    });
  }

  btn.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) setSymbol(detect()); };
  close.onclick = () => { panel.hidden = true; };
  scan.onclick = () => request('scan');
  coach.onclick = () => request('coach');

  window.addEventListener('market-intel-stream', event => {
    const data = event.detail || {};
    if (data.status) { status.textContent = data.status === 'live' ? '● Live market stream' : `Stream: ${data.status}`; return; }
    if (data.type === 'ticker') { setSymbol(data.symbol); price.textContent = Number.isFinite(data.price) ? Number(data.price).toLocaleString() : '—'; status.textContent = `${data.change24hPct >= 0 ? '+' : ''}${Number(data.change24hPct || 0).toFixed(2)}% · live`; }
  });
  setSymbol(detect());
})();
