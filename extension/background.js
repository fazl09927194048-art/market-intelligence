const DEFAULT_API = 'https://market-intelligence-840b.onrender.com';

function cleanSymbol(value) {
  const s = String(value || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.endsWith('USDT') ? s : `${s}USDT`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;
  const base = message.apiBase || DEFAULT_API;
  const symbol = cleanSymbol(message.symbol);
  const endpoint = message.type === 'MARKET_INTEL_LOOP'
    ? `${base}/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(message.interval || '15m')}`
    : `${base}/api/intelligence`;

  fetch(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(async response => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Core ${response.status}`);
      return data;
    })
    .then(data => sendResponse({ ok: true, data, symbol }))
    .catch(error => sendResponse({ ok: false, symbol, error: String(error) }));
  return true;
});
