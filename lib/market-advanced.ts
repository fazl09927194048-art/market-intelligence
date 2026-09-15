export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type OrderBookLevel = { price: number; quantity: number };
export type Trade = { id: number; price: number; quantity: number; time: number; isBuyerMaker: boolean };
export type Liquidation = { symbol: string; side: 'BUY' | 'SELL'; price: number; quantity: number; time: number };

export type AdvancedMarketData = {
  symbol: string;
  spot: {
    price: number | null;
    candles: Candle[];
    orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[]; lastUpdateId: number | null };
    trades: Trade[];
  };
  futures: {
    price: number | null;
    candles: Candle[];
    fundingRate: number | null;
    fundingTime: number | null;
    openInterest: number | null;
    openInterestTime: number | null;
    liquidations: Liquidation[];
  };
  microstructure: {
    spreadPct: number | null;
    orderBookImbalance: number | null;
    buyNotional: number;
    sellNotional: number;
    deltaNotional: number;
    tradeCount: number;
    liquidationBuyNotional: number;
    liquidationSellNotional: number;
    liquidationNetNotional: number;
  };
  derivatives: { basisPct: number | null };
  sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'>;
  warnings: string[];
  fetchedAt: string;
};

const TIMEOUT = 5000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
function n(value: unknown): number | null { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function positive(value: unknown): number | null { const parsed = n(value); return parsed !== null && parsed >= 0 ? parsed : null; }
function candle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const values = row.slice(0, 7).map(n); if (values.some(v => v === null)) return null;
  const [openTime, open, high, low, close, volume, closeTime] = values as number[];
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || high < low) return null;
  return { openTime, open, high, low, close, volume, closeTime };
}
function level(row: unknown): OrderBookLevel | null { if (!Array.isArray(row) || row.length < 2) return null; const price = positive(row[0]); const quantity = positive(row[1]); return price !== null && quantity !== null ? { price, quantity } : null; }
async function safe<T>(name: string, task: () => Promise<T>, fallback: T, warnings: string[], health: Record<string, 'healthy' | 'degraded' | 'down'>): Promise<T> {
  try { const value = await task(); health[name] = 'healthy'; return value; }
  catch (error) { health[name] = 'down'; warnings.push(`${name} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`); return fallback; }
}

export async function getAdvancedMarketData(rawSymbol = 'BTCUSDT', rawInterval = '1m', rawLimit: number | string = DEFAULT_LIMIT): Promise<AdvancedMarketData> {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const interval = /^(1s|1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/.test(rawInterval) ? rawInterval : '1m';
  const parsedLimit = Number(rawLimit); const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT));
  const spotBase = 'https://api.binance.com/api/v3'; const futuresBase = 'https://fapi.binance.com/fapi/v1';
  const warnings: string[] = []; const sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'> = {};
  const [spotPrice, spotCandles, orderBook, trades, futuresPrice, futuresCandles, funding, oi, liquidations] = await Promise.all([
    safe('Binance Spot Price', async () => n((await getJson(`${spotBase}/ticker/price?symbol=${symbol}`))?.price), null, warnings, sourceHealth),
    safe('Binance Spot OHLCV', async () => (await getJson(`${spotBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(candle).filter(Boolean) as Candle[], [], warnings, sourceHealth),
    safe('Binance Spot Order Book', async () => { const data = await getJson(`${spotBase}/depth?symbol=${symbol}&limit=100`); return { bids: (data?.bids ?? []).map(level).filter(Boolean) as OrderBookLevel[], asks: (data?.asks ?? []).map(level).filter(Boolean) as OrderBookLevel[], lastUpdateId: n(data?.lastUpdateId) }; }, { bids: [], asks: [], lastUpdateId: null }, warnings, sourceHealth),
    safe('Binance Spot Trades', async () => { const rows = await getJson(`${spotBase}/trades?symbol=${symbol}&limit=100`); const result: Trade[] = []; for (const row of Array.isArray(rows) ? rows : []) { const r = row as Record<string, unknown>; const id = n(r.id), price = n(r.price), quantity = n(r.qty), time = n(r.time); if (id === null || price === null || price <= 0 || quantity === null || quantity < 0 || time === null) continue; result.push({ id, price, quantity, time, isBuyerMaker: Boolean(r.isBuyerMaker) }); } return result; }, [], warnings, sourceHealth),
    safe('Binance Futures Price', async () => n((await getJson(`${futuresBase}/ticker/price?symbol=${symbol}`))?.price), null, warnings, sourceHealth),
    safe('Binance Futures OHLCV', async () => (await getJson(`${futuresBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(candle).filter(Boolean) as Candle[], [], warnings, sourceHealth),
    safe<{ rate: number | null; time: number | null }>('Binance Futures Funding', async () => { const r = await getJson(`${futuresBase}/premiumIndex?symbol=${symbol}`); return { rate: n(r?.lastFundingRate), time: n(r?.nextFundingTime) }; }, { rate: null, time: null }, warnings, sourceHealth),
    safe<{ value: number | null; time: number | null }>('Binance Futures Open Interest', async () => { const r = await getJson(`${futuresBase}/openInterest?symbol=${symbol}`); return { value: positive(r?.openInterest), time: Date.now() }; }, { value: null, time: null }, warnings, sourceHealth),
    safe('Binance Futures Liquidations', async () => { const rows = await getJson(`${futuresBase}/allForceOrders?symbol=${symbol}&limit=100`); const result: Liquidation[] = []; for (const row of Array.isArray(rows) ? rows : []) { const r = row as Record<string, unknown>; const price = n(r.price), quantity = n(r.origQty), time = n(r.time); if (price === null || price <= 0 || quantity === null || quantity < 0 || time === null) continue; result.push({ symbol: String(r.symbol ?? symbol), side: r.side === 'SELL' ? 'SELL' : 'BUY', price, quantity, time }); } return result; }, [], warnings, sourceHealth),
  ]);

  const bidTop = orderBook.bids[0]?.price ?? null, askTop = orderBook.asks[0]?.price ?? null;
  const bidDepth = orderBook.bids.reduce((s, x) => s + x.quantity, 0), askDepth = orderBook.asks.reduce((s, x) => s + x.quantity, 0);
  const orderBookImbalance = bidDepth + askDepth > 0 ? (bidDepth - askDepth) / (bidDepth + askDepth) : null;
  const spreadPct = bidTop !== null && askTop !== null && bidTop > 0 ? ((askTop - bidTop) / ((askTop + bidTop) / 2)) * 100 : null;
  const buyNotional = trades.filter(x => !x.isBuyerMaker).reduce((s, x) => s + x.price * x.quantity, 0);
  const sellNotional = trades.filter(x => x.isBuyerMaker).reduce((s, x) => s + x.price * x.quantity, 0);
  const liquidationBuyNotional = liquidations.filter(x => x.side === 'BUY').reduce((s, x) => s + x.price * x.quantity, 0);
  const liquidationSellNotional = liquidations.filter(x => x.side === 'SELL').reduce((s, x) => s + x.price * x.quantity, 0);
  const spotRef = spotPrice ?? null;
  const derivativesBasis = spotRef && spotRef > 0 && futuresPrice !== null ? ((futuresPrice - spotRef) / spotRef) * 100 : null;
  return {
    symbol,
    spot: { price: spotPrice, candles: spotCandles, orderBook, trades },
    futures: { price: futuresPrice, candles: futuresCandles, fundingRate: funding.rate, fundingTime: funding.time, openInterest: oi.value, openInterestTime: oi.time, liquidations },
    microstructure: { spreadPct, orderBookImbalance, buyNotional, sellNotional, deltaNotional: buyNotional - sellNotional, tradeCount: trades.length, liquidationBuyNotional, liquidationSellNotional, liquidationNetNotional: liquidationBuyNotional - liquidationSellNotional },
    derivatives: { basisPct: derivativesBasis },
    sourceHealth,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
