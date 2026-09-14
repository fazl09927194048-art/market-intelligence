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
      <div class="mi-actions">
        <button id="mi-scan">Deep Scan</button>
        <button id="mi-coach">AI Coach</button>
      </div>
      <div class="mi-actions">
        <button id="mi-refresh">Refresh</button>
        <button id="mi-details-btn">Details</button>
      </div>
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
  `;
  document.documentElement.appendChild(style); document.body.appendChild(root);

  const $ = id => root.querySelector(id);
  const btn = $('#mi-btn'), panel = $('#mi-panel'), close = $('#mi-close'), scan = $('#mi-scan'), coach = $('#mi-coach'), refresh = $('#mi-refresh'), detailsBtn = $('#mi-details-btn');
  const symbolEl = $('#mi-symbol'), price = $('#mi-price'), status = $('#mi-status');
  let currentSymbol = null;
  let refreshTimer = null;

  function detect() {
    const text = `${document.title} ${location.pathname} ${location.search}`;
    const m = text.match(/(?:BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK)[-_\/]?(?:USDT|USD)?/i);
    if (!m) return 'BTCUSDT';
    const raw = m[0].toUpperCase();
    return raw.endsWith('USDT') ? raw : `${raw.replace(/[-\/]USD$/,'')}USDT`;
  }

  function setSymbol(next, notifyStream = true) {
    const normalized = String(next || 'BTCUSDT').toUpperCase();
    if (normalized === currentSymbol) return;
    currentSymbol = normalized;
    symbolEl.textContent = currentSymbol;
    if (notifyStream) window.marketIntelStream?.setSymbol(currentSymbol);
  }

  function renderLoop(data) {
    const signal = data?.signal, forecast = data?.forecast, consensus = data?.consensus;
    $('#mi-signal').textContent = signal?.signal || signal?.side || signal?.direction || 'NO TRADE';
    $('#mi-forecast').textContent = forecast?.bias || '—';
    $('#mi-consensus').textContent = consensus?.direction || '—';
    $('#mi-confidence').textContent = `${Math.round(signal?.confidence ?? consensus?.confidence ?? 0)}%`;
    $('#mi-regime').textContent = data?.technical?.structure?.trend || 'UNKNOWN';
    $('#mi-data').textContent = data?.dataValid === true ? 'VALID' : 'CHECK';
    const analysts = Array.isArray(data?.analysts) ? data.analysts : [];
    const events = Array.isArray(data?.events) ? data.events : [];
    const news = Array.isArray(data?.news) ? data.news : [];
    $('#mi-details').textContent = [
      `Analysts: ${analysts.length}/33`,
      `Agreement: ${consensus?.agreement ?? 0}%`,
      `Regime: ${data?.technical?.structure?.trend ?? 'UNKNOWN'}`,
      `Signal score: ${signal?.score ?? 'n/a'}`,
      `Entry: ${signal?.entry ?? 'n/a'}`,
      `Stop: ${signal?.stopLoss ?? 'n/a'}`,
      `TP: ${(signal?.takeProfits || []).join(', ') || 'n/a'}`,
      `RR: ${signal?.riskReward ?? 'n/a'}`,
      `News: ${news.length} · Events: ${events.length}`,
      `Data valid: ${data?.dataValid === true ? 'YES' : 'NO'}`,
      `Warnings: ${(data?.warnings || []).join(' | ') || 'none'}`,
    ].join('\n');
  }

  function request(force = false, mode = 'scan') {
    const current = detect();
    setSymbol(current);
    status.textContent = mode === 'coach' ? 'AI Coach analyzing…' : '33 analysts analyzing…';
    chrome.runtime.sendMessage({ type:'MARKET_INTEL_LOOP', symbol:current, interval:'15m', force }, response => {
      if (chrome.runtime.lastError || !response?.ok) { status.textContent = 'Core unavailable — no fabricated result.'; return; }
      renderLoop(response.data);
      const c = response.data?.consensus;
      status.textContent = `${c?.direction || 'NEUTRAL'} · ${c?.confidence ?? 0}% · ${response.cached ? 'cached' : 'fresh'} cycle`;
      $('#mi-details').hidden = false;
      if (mode === 'coach') $('#mi-details').textContent += '\n\nCoach: follow evidence, respect invalidation, and avoid trading when data quality is insufficient.';
    });
  }

  function startAutoRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!panel.hidden) request(false, 'scan');
    }, 30000);
  }

  btn.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) { setSymbol(detect()); request(false); } };
  close.onclick = () => { panel.hidden = true; };
  scan.onclick = () => request(true, 'scan');
  coach.onclick = () => request(true, 'coach');
  refresh.onclick = () => request(true, 'scan');
  detailsBtn.onclick = () => { $('#mi-details').hidden = !$('#mi-details').hidden; };

  window.addEventListener('market-intel-stream', event => {
    const data = event.detail || {};
    if (data.status) { status.textContent = data.status === 'live' ? '● Live market stream' : `Stream: ${data.status}`; return; }
    if (data.type === 'ticker') {
      setSymbol(data.symbol, false);
      price.textContent = Number.isFinite(data.price) ? Number(data.price).toLocaleString() : '—';
      status.textContent = `${data.change24hPct >= 0 ? '+' : ''}${Number(data.change24hPct || 0).toFixed(2)}% · live`;
    }
  });

  setSymbol(detect());
  startAutoRefresh();
})();
