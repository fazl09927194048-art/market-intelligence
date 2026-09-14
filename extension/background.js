const DEFAULT_API = 'https://market-intelligence-840b.onrender.com';
const REQUEST_TIMEOUT = 12000;
const CACHE_TTL = 8000;
const cache = new Map();

function cleanSymbol(value) {
  const s = String(value || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.endsWith('USDT') ? s : `${s}USDT`;
}

async function getApiBase() {
  const stored = await chrome.storage.local.get(['apiBase']);
  return String(stored.apiBase || DEFAULT_API).replace(/\/$/, '');
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Core ${response.status}`);
    if (!data || typeof data !== 'object') throw new Error('Core returned invalid JSON');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function runLoop(symbol, interval, force = false) {
  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const base = await getApiBase();
  const url = `${base}/api/loop?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
  const data = await fetchJson(url);
  cache.set(key, { at: Date.now(), data });
  return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;
  (async () => {
    const symbol = cleanSymbol(message.symbol);
    if (message.type === 'SET_API_BASE') {
      const apiBase = String(message.apiBase || DEFAULT_API).replace(/\/$/, '');
      if (!/^https:\/\//i.test(apiBase)) throw new Error('API base must use HTTPS');
      await chrome.storage.local.set({ apiBase });
      sendResponse({ ok: true, apiBase });
      return;
    }
    if (message.type === 'PING_CORE') {
      const base = await getApiBase();
      const data = await fetchJson(`${base}/api/health`);
      sendResponse({ ok: true, data });
      return;
    }
    if (message.type === 'MARKET_INTEL_LOOP') {
      const data = await runLoop(symbol, String(message.interval || '15m'), Boolean(message.force));
      sendResponse({ ok: true, data, symbol, cached: !message.force });
      return;
    }
    sendResponse({ ok: false, error: 'Unknown extension message' });
  })().catch(error => sendResponse({ ok: false, symbol: cleanSymbol(message.symbol), error: String(error?.message || error) }));
  return true;
});
