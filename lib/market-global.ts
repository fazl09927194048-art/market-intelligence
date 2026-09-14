export type MarketGlobalMetrics = {
  totalMarketCapUsd: number | null;
  totalVolume24hUsd: number | null;
  btcDominancePct: number | null;
  activeCryptocurrencies: number | null;
  marketCapChange24hPct: number | null;
  longShort?: {
    symbol: string;
    period: string;
    globalLongAccountPct: number | null;
    globalShortAccountPct: number | null;
    topTraderLongAccountPct: number | null;
    topTraderShortAccountPct: number | null;
    timestamp: number | null;
  };
  sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'>;
  warnings: string[];
  fetchedAt: string;
};

const TIMEOUT = 7000;

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratioToPct(value: unknown): number | null {
  const ratio = numberOrNull(value);
  if (ratio === null || ratio < 0) return null;
  return (ratio / (1 + ratio)) * 100;
}

export async function getMarketGlobalMetrics(symbol = 'BTCUSDT', period = '5m'): Promise<MarketGlobalMetrics> {
  const warnings: string[] = [];
  const sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'> = {};
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanPeriod = /^(5m|15m|30m|1h|2h|4h|6h|12h|1d)$/.test(period) ? period : '5m';

  let totalMarketCapUsd: number | null = null;
  let totalVolume24hUsd: number | null = null;
  let btcDominancePct: number | null = null;
  let activeCryptocurrencies: number | null = null;
  let marketCapChange24hPct: number | null = null;

  try {
    const global = await getJson('https://api.coingecko.com/api/v3/global');
    const data = global?.data;
    totalMarketCapUsd = numberOrNull(data?.total_market_cap?.usd);
    totalVolume24hUsd = numberOrNull(data?.total_volume?.usd);
    btcDominancePct = numberOrNull(data?.market_cap_percentage?.btc);
    activeCryptocurrencies = numberOrNull(data?.active_cryptocurrencies);
    marketCapChange24hPct = numberOrNull(data?.market_cap_change_percentage_24h_usd);
    sourceHealth.CoinGeckoGlobal = 'healthy';
  } catch (error) {
    sourceHealth.CoinGeckoGlobal = 'down';
    warnings.push(`CoinGecko global metrics unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  let longShort: MarketGlobalMetrics['longShort'];
  try {
    const base = 'https://fapi.binance.com/futures/data';
    const [globalRows, topRows] = await Promise.all([
      getJson(`${base}/globalLongShortAccountRatio?symbol=${cleanSymbol}&period=${cleanPeriod}&limit=1`),
      getJson(`${base}/topLongShortAccountRatio?symbol=${cleanSymbol}&period=${cleanPeriod}&limit=1`),
    ]);
    const globalRow = Array.isArray(globalRows) ? globalRows[0] : null;
    const topRow = Array.isArray(topRows) ? topRows[0] : null;
    longShort = {
      symbol: cleanSymbol,
      period: cleanPeriod,
      globalLongAccountPct: ratioToPct(globalRow?.longShortRatio),
      globalShortAccountPct: (() => {
        const long = ratioToPct(globalRow?.longShortRatio);
        return long === null ? null : 100 - long;
      })(),
      topTraderLongAccountPct: ratioToPct(topRow?.longShortRatio),
      topTraderShortAccountPct: (() => {
        const long = ratioToPct(topRow?.longShortRatio);
        return long === null ? null : 100 - long;
      })(),
      timestamp: numberOrNull(globalRow?.timestamp),
    };
    sourceHealth.BinanceLongShort = 'healthy';
  } catch (error) {
    sourceHealth.BinanceLongShort = 'down';
    warnings.push(`Binance long/short metrics unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return {
    totalMarketCapUsd,
    totalVolume24hUsd,
    btcDominancePct,
    activeCryptocurrencies,
    marketCapChange24hPct,
    longShort,
    sourceHealth,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
