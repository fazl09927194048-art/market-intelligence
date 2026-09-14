(() => {
  if (window.__MARKET_INTEL_STREAM__) return;
  window.__MARKET_INTEL_STREAM__ = true;

  const state = {
    ws: null,
    symbol: null,
    attempt: 0,
    timer: null,
    heartbeat: null,
    lastEventTime: 0,
    lastUpdateId: 0,
  };

  const allowed = new Set(['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT']);

  function normalizeSymbol(value) {
    const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (allowed.has(clean)) return clean;
    const match = clean.match(/(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK)(USDT|USD)?/);
    return match ? `${match[1]}USDT` : 'BTCUSDT';
  }

  function emit(payload) {
    window.dispatchEvent(new CustomEvent('market-intel-stream', { detail: payload }));
  }

  function close() {
    if (state.timer) clearTimeout(state.timer);
    if (state.heartbeat) clearTimeout(state.heartbeat);
    state.timer = null;
    state.heartbeat = null;
    if (state.ws) {
      try { state.ws.close(); } catch {}
    }
    state.ws = null;
  }

  function scheduleReconnect() {
    if (state.timer) return;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(state.attempt, 5)));
    state.attempt += 1;
    state.timer = setTimeout(() => {
      state.timer = null;
      connect(state.symbol);
    }, delay);
  }

  function armHeartbeat() {
    if (state.heartbeat) clearTimeout(state.heartbeat);
    state.heartbeat = setTimeout(() => {
      emit({ type: 'status', status: 'stale', symbol: state.symbol });
      try { state.ws?.close(); } catch {}
    }, 15000);
  }

  function connect(rawSymbol) {
    const symbol = normalizeSymbol(rawSymbol);
    state.symbol = symbol;
    close();

    const streamSymbol = symbol.toLowerCase();
    const url = `wss://stream.binance.com:9443/stream?streams=${streamSymbol}@ticker/${streamSymbol}@trade/${streamSymbol}@depth5@100ms`;
    const ws = new WebSocket(url);
    state.ws = ws;
    emit({ type: 'status', status: 'connecting', symbol });

    ws.onopen = () => {
      state.attempt = 0;
      state.lastEventTime = 0;
      state.lastUpdateId = 0;
      emit({ type: 'status', status: 'live', symbol });
      armHeartbeat();
    };

    ws.onmessage = event => {
      armHeartbeat();
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      const data = packet?.data;
      if (!data || typeof data !== 'object') return;

      const eventTime = Number(data.E || 0);
      const updateId = Number(data.u || data.lastUpdateId || 0);
      if (eventTime && eventTime < state.lastEventTime) return;
      if (updateId && updateId < state.lastUpdateId) return;
      if (eventTime) state.lastEventTime = eventTime;
      if (updateId) state.lastUpdateId = updateId;

      if (data.e === '24hrTicker') {
        emit({ type: 'ticker', symbol, eventTime, price: Number(data.c), change24hPct: Number(data.P), volume24h: Number(data.q) });
      } else if (data.e === 'trade') {
        emit({ type: 'trade', symbol, eventTime, tradeId: Number(data.t), price: Number(data.p), quantity: Number(data.q), buyerMaker: Boolean(data.m) });
      } else if (data.e === 'depthUpdate') {
        emit({ type: 'depth', symbol, eventTime, updateId, bids: data.b || [], asks: data.a || [] });
      }
    };

    ws.onerror = () => emit({ type: 'status', status: 'error', symbol });
    ws.onclose = () => {
      if (state.ws === ws) {
        state.ws = null;
        emit({ type: 'status', status: 'reconnecting', symbol });
        scheduleReconnect();
      }
    };
  }

  window.marketIntelStream = {
    connect,
    disconnect: close,
    setSymbol: connect,
  };

  connect(normalizeSymbol(document.title + ' ' + location.pathname));
})();
