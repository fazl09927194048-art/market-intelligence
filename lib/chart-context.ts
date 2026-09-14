export type ChartContext = {
  source: 'browser';
  symbol: string;
  interval: string;
  pagePrice: number | null;
  observedAt: string;
  extraction: 'dom' | 'url' | 'none';
  quality: 'verified' | 'partial' | 'none';
  ageMs: number;
};

const INTERVALS = new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']);

export function normalizeInterval(value: string | null | undefined, fallback = '15m'): string {
  const raw = String(value ?? '').trim();
  return INTERVALS.has(raw) ? raw : fallback;
}

export function normalizeChartContext(input: Partial<ChartContext> | null | undefined, symbol: string, interval: string): ChartContext | null {
  if (!input) return null;
  const pagePrice = typeof input.pagePrice === 'number' && Number.isFinite(input.pagePrice) && input.pagePrice > 0 ? input.pagePrice : null;
  const extraction = input.extraction === 'dom' || input.extraction === 'url' || input.extraction === 'none' ? input.extraction : 'none';
  const observed = typeof input.observedAt === 'string' && !Number.isNaN(Date.parse(input.observedAt)) ? new Date(input.observedAt).toISOString() : new Date().toISOString();
  const ageMs = Math.max(0, Date.now() - Date.parse(observed));
  const quality = pagePrice !== null && extraction === 'dom' && ageMs <= 120000 ? 'verified' : pagePrice !== null ? 'partial' : 'none';
  return { source:'browser', symbol, interval:normalizeInterval(input.interval, interval), pagePrice, observedAt:observed, extraction, quality, ageMs };
}
