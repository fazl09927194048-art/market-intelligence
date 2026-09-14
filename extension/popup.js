const $ = (id) => document.getElementById(id);
const state = { tab: null, symbol: 'BTCUSDT', last: null, busy: false };

function detectSymbol(tab) {
  const text = `${tab?.url || ''} ${tab?.title || ''}`.toUpperCase();
  const a = text.match(/\b([A-Z]{2,12})USDT\b/);
  const b = text.match(/\b([A-Z]{2,12})(?:USD|USDC)\b/);
  return a?.[1] ? `${a[1]}USDT` : b?.[1] ? `${b[1]}USDT` : 'BTCUSDT';
}
function setStatus(text, online = true) { $('status').textContent = text; $('status').classList.toggle('offline', !online); }
function number(value, digits = 2) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'; }
function show(data, symbol) {
  state.last = data;
  $('symbol').textContent = symbol;
  $('price').textContent = Number(data?.marketData?.spot?.price) > 0 ? number(data.marketData.spot.price, 8) : '—';
  const signal = data?.signal || {}, forecast = data?.forecast || {}, consensus = data?.consensus || {}, technical = data?.technical || {};
  $('signal').textContent = signal.signal || 'NO TRADE';
  $('forecast').textContent = forecast.bias || 'UNAVAILABLE';
  $('consensus').textContent = consensus.direction || consensus.signal || '—';
  const confidence = Number(signal.confidence ?? forecast.confidence ?? technical.confidence);
  $('confidence').textContent = Number.isFinite(confidence) ? `${Math.round(confidence)}%` : '—';
  $('meta').textContent = `${technical.structure?.trend || 'Market'} · ${data?.analysts?.length || 0} analysts · ${data?.news?.length || 0} news`;
  $('warning').textContent = (data?.warnings || []).slice(0, 3).join('\n');
  $('entry').textContent = number(signal.entry, 8);
  $('sl').textContent = number(signal.stopLoss, 8);
  $('tp').textContent = number(signal.takeProfits?.[0], 8);
  $('rr').textContent = number(signal.riskReward, 2);
  $('detailsPanel').textContent = JSON.stringify({ signal, forecast, consensus, technical, events: data?.events || [], news: data?.news || [] }, null, 2).slice(0, 12000);
  setStatus('●', true);
}
async function getActiveTab() { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); return tabs[0]; }
async function run(force = false) {
  if (state.busy) return;
  state.busy = true; $('refresh').disabled = true; $('scan').disabled = true;
  $('meta').textContent = force ? 'Running deep market scan…' : 'Loading live intelligence…';
  try {
    state.tab = await getActiveTab(); state.symbol = detectSymbol(state.tab); $('symbol').textContent = state.symbol;
    const response = await chrome.runtime.sendMessage({ type: 'MARKET_INTEL_LOOP', symbol: state.symbol, interval: '15m', force });
    if (!response?.ok) throw new Error(response?.error || 'Core unavailable');
    show(response.data, state.symbol);
  } catch (error) {
    setStatus('○', false); $('warning').textContent = String(error?.message || error); $('meta').textContent = 'Core unavailable — no fabricated market result shown.';
  } finally { state.busy = false; $('refresh').disabled = false; $('scan').disabled = false; }
}
$('refresh').addEventListener('click', () => run(true)); $('scan').addEventListener('click', () => run(true));
$('details').addEventListener('click', () => { $('detailsPanel').hidden = !$('detailsPanel').hidden; });
run(false);
