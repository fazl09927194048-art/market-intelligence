import {getMarkets, type MarketProviderResult, type MarketSnapshot} from './market';

export type MarketProviderAdapter = {
  name: string;
  priority: number;
  fetch: () => Promise<MarketProviderResult>;
};

export type MarketServiceResult = MarketProviderResult & {
  attemptedProviders: string[];
  selectedProvider: string;
};

const adapters: MarketProviderAdapter[] = [
  {name: 'default-provider-chain', priority: 10, fetch: getMarkets},
];

let cache: {value: MarketServiceResult; expiresAt: number} | null = null;
let inFlight: Promise<MarketServiceResult> | null = null;
const CACHE_MS = 3000;

function normalize(result: MarketProviderResult, attemptedProviders: string[]): MarketServiceResult {
  const markets: MarketSnapshot[] = result.markets.filter(m =>
    Number.isFinite(m.price) && m.price > 0 && Number.isFinite(m.change24h)
  );
  return {
    ...result,
    markets,
    attemptedProviders,
    selectedProvider: result.provider,
  };
}

export async function getMarketService(): Promise<MarketServiceResult> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const attempted: string[] = [];
    const ordered = [...adapters].sort((a, b) => a.priority - b.priority);
    let last: MarketServiceResult | null = null;
    for (const adapter of ordered) {
      attempted.push(adapter.name);
      try {
        const result = normalize(await adapter.fetch(), attempted);
        last = result;
        if (result.markets.length > 0) {
          cache = {value: result, expiresAt: Date.now() + CACHE_MS};
          return result;
        }
      } catch {
        // Continue through the provider chain. No fabricated fallback values.
      }
    }
    const empty: MarketServiceResult = last ?? {
      markets: [], provider: 'unavailable', warnings: ['No market provider returned validated data.'],
      fetchedAt: new Date().toISOString(), sourceHealth: {}, attemptedProviders: attempted,
      selectedProvider: 'unavailable',
    };
    cache = {value: empty, expiresAt: Date.now() + 1000};
    return empty;
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

export function clearMarketServiceCache() { cache = null; }
