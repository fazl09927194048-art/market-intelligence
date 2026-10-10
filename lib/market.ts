export type MarketSnapshot = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h?: number;
  marketCap?: number;
  source: string;
  fetchedAt: string;
  freshnessMs: number;
  quality: 'live' | 'stale' | 'invalid';
};

export type MarketProviderResult = {
  markets: MarketSnapshot[];
  provider: string;
  warnings: string[];
  fetchedAt: string;
  sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'>;
};

const ASSETS = [
  ['BTC','Bitcoin','bitcoin'],
  ['ETH','Ethereum','ethereum'],
  ['SOL','Solana','solana'],
  ['BNB','BNB','binancecoin'],
  ['XRP','XRP','ripple'],
  ['ADA','Cardano','cardano'],
  ['DOGE','Dogecoin','dogecoin'],
  ['TRX','TRON','tron'],
  ['LINK','Chainlink','chainlink'],
  ['DOT','Polkadot','polkadot'],
  ['LTC','Litecoin','litecoin'],
  ['AVAX','Avalanche','avalanche-2'],
  ['SHIB','Shiba Inu','shiba-inu'],
  ['TON','Toncoin','the-open-network'],
] as const;

const REQUEST_TIMEOUT_MS = 7000;
const MAX_SNAPSHOT_AGE_MS = 120_000;

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
    headers: { accept: 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function makeSnapshot(input: Omit<MarketSnapshot, 'freshnessMs' | 'quality'>): MarketSnapshot {
  const fetchedAtMs = Date.parse(input.fetchedAt);
  const freshnessMs = Number.isFinite(fetchedAtMs) ? Math.max(0, Date.now() - fetchedAtMs) : Number.POSITIVE_INFINITY;
  const quality = freshnessMs <= MAX_SNAPSHOT_AGE_MS ? 'live' : 'stale';
  return { ...input, freshnessMs, quality };
}

function validateSnapshot(row: MarketSnapshot): boolean {
  return validNumber(row.price) && row.price > 0 &&
    validNumber(row.change24h) &&
    (row.volume24h === undefined || (validNumber(row.volume24h) && row.volume24h >= 0)) &&
    (row.marketCap === undefined || (validNumber(row.marketCap) && row.marketCap >= 0));
}

async function coinGecko(): Promise<MarketSnapshot[]> {
  const ids = ASSETS.map(x => x[2]).join(',');
  const data = await json(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
  const fetchedAt = new Date().toISOString();

  return ASSETS.map(([symbol, name, id]) => makeSnapshot({
    symbol,
    name,
    price: Number(data[id]?.usd),
    change24h: Number(data[id]?.usd_24h_change),
    volume24h: Number(data[id]?.usd_24h_vol),
    marketCap: Number(data[id]?.usd_market_cap),
    source: 'CoinGecko',
    fetchedAt,
  })).filter(validateSnapshot);
}

async function binance(): Promise<MarketSnapshot[]> {
  const rows = await Promise.all(ASSETS.map(([symbol]) => json(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${symbol}USDT`)));
  const fetchedAt = new Date().toISOString();

  return rows.map((row: unknown, i) => {
    const r = row as Record<string, unknown>;
    return makeSnapshot({
      symbol: ASSETS[i][0],
      name: ASSETS[i][1],
      price: Number(r.lastPrice),
      change24h: Number(r.priceChangePercent),
      volume24h: Number(r.quoteVolume),
      source: 'Binance',
      fetchedAt,
    });
  }).filter(validateSnapshot);
}

async function cryptoCompare(): Promise<MarketSnapshot[]> {
  const symbols = ASSETS.map(x => x[0]).join(',');
  const data = await json(`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbols}&tsyms=USD`);
  const raw = data?.RAW ?? {};
  const fetchedAt = new Date().toISOString();

  return ASSETS.map(([symbol, name]) => {
    const r = raw[symbol]?.USD;
    return makeSnapshot({
      symbol,
      name,
      price: Number(r?.PRICE),
      change24h: Number(r?.CHANGEPCT24HOUR),
      volume24h: Number(r?.TOTALVOLUME24HTO),
      marketCap: Number(r?.MKTCAP),
      source: 'CryptoCompare',
      fetchedAt,
    });
  }).filter(validateSnapshot);
}

async function fetchProvider(name: string, fn: () => Promise<MarketSnapshot[]>, warnings: string[], health: Record<string, 'healthy' | 'degraded' | 'down'>) {
  try {
    const markets = await fn();
    if (markets.length === ASSETS.length) {
      health[name] = 'healthy';
      return markets;
    }
    if (markets.length > 0) {
      health[name] = 'degraded';
      warnings.push(`${name} returned partial validated data (${markets.length}/${ASSETS.length}).`);
      return markets;
    }
    health[name] = 'degraded';
    warnings.push(`${name} returned no validated market rows.`);
  } catch (error) {
    health[name] = 'down';
    warnings.push(`${name} unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return [];
}

export async function getMarkets(): Promise<MarketProviderResult> {
  const warnings: string[] = [];
  const sourceHealth: Record<string, 'healthy' | 'degraded' | 'down'> = {};
  const merged = new Map<string, MarketSnapshot>();

  // Merge validated rows from keyless sources so one partial provider cannot hide supported assets.
  const providers: Array<[string, () => Promise<MarketSnapshot[]>]> = [
    ['CoinGecko', coinGecko],
    ['Binance', binance],
    ['CryptoCompare', cryptoCompare],
  ];

  for (const [name, fn] of providers) {
    const rows = await fetchProvider(name, fn, warnings, sourceHealth);
    for (const row of rows) if (!merged.has(row.symbol)) merged.set(row.symbol, row);
    if (merged.size === ASSETS.length) break;
  }

  const markets = ASSETS.map(([symbol]) => merged.get(symbol)).filter((row): row is MarketSnapshot => Boolean(row));
  return {
    markets,
    provider: markets.length ? [...new Set(markets.map(row => row.source))].join(' + ') : 'unavailable',
    warnings,
    fetchedAt: new Date().toISOString(),
    sourceHealth,
  };
}
