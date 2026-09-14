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
  sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'>;
  warnings: string[];
  fetchedAt: string;
};

const TIMEOUT = 7000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

async function getJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function n(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = n(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function candle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const values = row.slice(0, 7).map(n);
  if (values.some(v => v === null)) return null;
  const [openTime, open, high, low, close, volume, closeTime] = values as number[];
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || high < low) return null;
  return { openTime, open, high, low, close, volume, closeTime };
}

function level(row: unknown): OrderBookLevel | null {
  if (!Array.isArray(row) || row.length < 2) return null;
  const price = positive(row[0]);
  const quantity = positive(row[1]);
  return price !== null && quantity !== null ? { price, quantity } : null;
}

async function safe<T>(
  name: string,
  task: () => Promise<T>,
  fallback: T,
  warnings: string[],
  health: Record<string, 'healthy' | 'degraded' | 'down'>,
): Promise<T> {
  try {
    const value = await task();
    health[name] = 'healthy';
    return value;
  } catch (error) {
    health[name] = 'down';
    warnings.push(`${name} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    return fallback;
  }
}

export async function getAdvancedMarketData(rawSymbol = 'BTCUSDT', rawInterval = '1m', rawLimit = DEFAULT_LIMIT): Promise<AdvancedMarketData> {
  const symbol = rawSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const interval = /^(1s|1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/.test(rawInterval) ? rawInterval : '1m';
  const parsedLimit = Number(rawLimit);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT));
  const spotBase = 'https://api.binance.com/api/v3';
  const futuresBase = 'https://fapi.binance.com/fapi/v1';
  const warnings: string[] = [];
  const sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'> = {};

  const [spotPrice, spotCandles, orderBook, trades, futuresPrice, futuresCandles, funding, oi, liquidations] = await Promise.all([
    safe('Binance Spot Price', async () => n((await getJson(`${spotBase}/ticker/price?symbol=${symbol}`))?.price), null, warnings, sourceHealth),
    safe('Binance Spot OHLCV', async () => (await getJson(`${spotBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(candle).filter(Boolean) as Candle[], [], warnings, sourceHealth),
    safe('Binance Spot Order Book', async () => {
      const data = await getJson(`${spotBase}/depth?symbol=${symbol}&limit=100`);
      return {
        bids: (data?.bids ?? []).map(level).filter(Boolean) as OrderBookLevel[],
        asks: (data?.asks ?? []).map(level).filter(Boolean) as OrderBookLevel[],
        lastUpdateId: n(data?.lastUpdateId),
      };
    }, { bids: [], asks: [], lastUpdateId: null }, warnings, sourceHealth),
    safe('Binance Spot Trades', async () => {
      const rows = await getJson(`${spotBase}/trades?symbol=${symbol}&limit=100`);
      return (rows ?? []).map((r: Record<string, unknown>) => ({
        id: n(r.id), price: n(r.price), quantity: n(r.qty), time: n(r.time), isBuyerMaker: Boolean(r.isBuyerMaker),
      })).filter((r: { id: number | null; price: number | null; quantity: number | null; time: number | null }) =>
        r.id !== null && r.price !== null && r.price > 0 && r.quantity !== null && r.quantity >= 0 && r.time !== null)
        .map(r => ({ id: r.id as number, price: r.price as number, quantity: r.quantity as number, time: r.time as number, isBuyerMaker: r.isBuyerMaker })) as Trade[];
    }, [], warnings, sourceHealth),
    safe('Binance Futures Price', async () => n((await getJson(`${futuresBase}/ticker/price?symbol=${symbol}`))?.price), null, warnings, sourceHealth),
    safe('Binance Futures OHLCV', async () => (await getJson(`${futuresBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)).map(candle).filter(Boolean) as Candle[], [], warnings, sourceHealth),
    safe('Binance Futures Funding', async () => {
      const r = await getJson(`${futuresBase}/premiumIndex?symbol=${symbol}`);
      return { rate: n(r?.lastFundingRate), time: n(r?.nextFundingTime) };
    }, { rate: null, time: null }, warnings, sourceHealth),
    safe('Binance Futures Open Interest', async () => {
      const r = await getJson(`${futuresBase}/openInterest?symbol=${symbol}`);
      return { value: positive(r?.openInterest), time: Date.now() };
    }, { value: null, time: null }, warnings, sourceHealth),
    safe('Binance Futures Liquidations', async () => {
      const rows = await getJson(`${futuresBase}/allForceOrders?symbol=${symbol}&limit=100`);
      return (rows ?? []).map((r: Record<string, unknown>): Liquidation | null => {
        const price = n(r.price);
        const quantity = n(r.origQty);
        const time = n(r.time);
        if (price === null || price <= 0 || quantity === null || quantity < 0 || time === null) return null;
        return { symbol: String(r.symbol ?? symbol), side: r.side === 'SELL' ? 'SELL' : 'BUY', price, quantity, time };
      }).filter((r: Liquidation | null): r is Liquidation => r !== null);
    }, [], warnings, sourceHealth),
  ]);

  return {
    symbol,
    spot: { price: spotPrice, candles: spotCandles, orderBook, trades },
    futures: {
      price: futuresPrice,
      candles: futuresCandles,
      fundingRate: funding.rate,
      fundingTime: funding.time,
      openInterest: oi.value,
      openInterestTime: oi.time,
      liquidations,
    },
    sourceHealth,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
