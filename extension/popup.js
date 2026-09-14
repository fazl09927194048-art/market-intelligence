const $ = (id) => document.getElementById(id);

const state = { tab: null, symbol: 'BTCUSDT', last: null, busy: false };

function cleanSymbol(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.endsWith('USDT')) return raw;
  if (raw.endsWith('USDC')) return `${raw.slice(0, -4)}USDT`;
  if (raw.endsWith('USD')) return `${raw.slice(0, -3)}USDT`;
  return raw ? `${raw}USDT` : 'BTCUSDT';
}

function detectSymbol(tab) {
  const text = `${tab?.url || ''} ${tab?.title || ''}`.toUpperCase();
  const matches = [
    text.match(/\b([A-Z]{2,12})USDT\b/),
    text.match(/\b([A-Z]{2,12})(?:USD|USDC)\b/),
  ];
  for (const match of matches) if (match?.[1]) return `${match[1]}USDT`;
  return 'BTCUSDT';
}

function setStatus(text, online = true) {
  $('status').textContent = text;
  $('status').classList.toggle('offline', !online);
}

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function show(data, symbol) {
  state.last = data;
  $('symbol').textContent = symbol;
  const price = data?.marketData?.spot?.price;
  $('price').textContent = Number(price) > 0 ? number(price, 8) : '—';
  const signal = data?.signal || {};
  const forecast = data?.forecast || {};
  const consensus = data?.consensus || {};
  const technical = data?.technical || {};
  $('signal').textContent = signal.direction || signal.action || 'NO TRADE';
  $('forecast').textContent = forecast.bias || forecast.direction || '—';
  $('consensus').textContent = consensus.direction || consensus.signal || '—';
  const confidence = Number(signal.confidence ?? forecast.confidence ?? technical.confidence);
  $('confidence').textContent = Number.isFinite(confidence) ? `${Math.round(confidence)}%` : '—';
  $('meta').textContent = `${technical.regime || 'Market'} · ${data?.analysts?.length || 0} analysts · ${data?.news?.length || 0} news`;
  $('warning').textContent = (data?.warnings || []).slice(0, 3).join('\n');
  $('entry').textContent = number(signal.entry, 8);
  $('sl').textContent = number(signal.stopLoss ?? signal.sl, 8);
  $('tp').textContent = number(signal.takeProfit ?? signal.tp, 8);
  $('rr').textContent = number(signal.riskReward ?? signal.rr, 2);
  setStatus('●', true);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function run(force = false) {
  if (state.busy) return;
  state.busy = true;
  $('refresh').disabled = true;
  $('scan').disabled = true;
  $('meta').textContent = force ? 'Running deep market scan…' : 'Loading live intelligence…';
  try {
    state.tab = await getActiveTab();
    state.symbol = detectSymbol(state.tab);
    $('symbol').textContent = state.symbol;
    const response = await chrome.runtime.sendMessage({
      type: 'MARKET_INTEL_LOOP',
      symbol: state.symbol,
      interval: '15m',
      force,
    });
    if (!response?.ok) throw new Error(response?.error || 'Core unavailable');
    show(response.data, state.symbol);
  } catch (error) {
    setStatus('○', false);
    $('warning').textContent = String(error?.message || error);
    $('meta').textContent = 'Core unavailable — no fabricated market result shown.';
  } finally {
    state.busy = false;
    $('refresh').disabled = false;
    $('scan').disabled = false;
  }
}

$('refresh').addEventListener('click', () => run(true));
$('scan').addEventListener('click', () => run(true));
$('details').addEventListener('click', () => {
  const base = state.last ? JSON.stringify(state.last, null, 2) : 'No analysis loaded.';
  $('detailsPanel').textContent = base.slice(0, 12000);
  $('detailsPanel').hidden = !$('detailsPanel').hidden;
});

run(false);
