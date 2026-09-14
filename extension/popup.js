const $ = (id) => document.getElementById(id);

function detectSymbol(tab) {
  const text = `${tab?.url || ''} ${tab?.title || ''}`.toUpperCase();
  const direct = text.match(/\b([A-Z]{2,12})(?:USDT|USD|USDC)\b/);
  if (direct) return `${direct[1]}USDT`;
  const pair = text.match(/\b([A-Z]{2,12})USDT\b/);
  return pair ? pair[0] : 'BTCUSDT';
}

function show(data, symbol) {
  const signal = data?.signal || {};
  const forecast = data?.forecast || {};
  const consensus = data?.consensus || {};
  const technical = data?.technical || {};
  $('symbol').textContent = symbol;
  $('price').textContent = Number(data?.marketData?.spot?.price || 0) > 0 ? Number(data.marketData.spot.price).toLocaleString() : '—';
  $('signal').textContent = signal.direction || signal.action || 'NO TRADE';
  $('forecast').textContent = forecast.bias || forecast.direction || '—';
  $('consensus').textContent = consensus.direction || consensus.signal || '—';
  $('confidence').textContent = Number(signal.confidence ?? forecast.confidence ?? technical.confidence ?? 0) ? `${Math.round(Number(signal.confidence ?? forecast.confidence ?? technical.confidence))}%` : '—';
  $('meta').textContent = `${technical.regime || data?.marketData?.regime || 'Market'} · ${data?.analysts?.length || 0} analysts · ${data?.news?.length || 0} news`;
  $('warning').textContent = (data?.warnings || []).slice(0, 2).join('\n');
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function run(force = false) {
  $('status').textContent = '●';
  try {
    const tab = await getActiveTab();
    const symbol = detectSymbol(tab);
    $('symbol').textContent = symbol;
    const response = await chrome.runtime.sendMessage({ type: 'MARKET_INTEL_LOOP', symbol, interval: '15m', force });
    if (!response?.ok) throw new Error(response?.error || 'Core unavailable');
    show(response.data, symbol);
  } catch (error) {
    $('status').textContent = '○';
    $('warning').textContent = String(error?.message || error);
    $('meta').textContent = 'Core unavailable — no fabricated market result shown.';
  }
}

$('refresh').addEventListener('click', () => run(true));
$('scan').addEventListener('click', () => run(true));
run(false);
