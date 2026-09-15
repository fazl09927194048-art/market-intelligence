import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT'];
const TIMEOUT_MS = 2500;
let cache: { at: number; data: Record<string, unknown> } | null = null;

export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get('symbols') || DEFAULT_SYMBOLS.join(','))
    .toUpperCase().split(',').map(s => s.trim().replace(/[^A-Z0-9]/g, '')).filter(Boolean).slice(0, 20);
  const unique = [...new Set(symbols.length ? symbols : DEFAULT_SYMBOLS)];
  const now = Date.now();
  if (cache && now - cache.at < 800 && unique.every(s => cache!.data[s])) {
    return NextResponse.json({ ...cache.data, serverAt: new Date().toISOString(), cached: true, latencyMs: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    try {
      const response = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(unique))}`, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Binance market data ${response.status}`);
      const rows = await response.json() as Array<Record<string, string>>;
      const data: Record<string, unknown> = {};
      for (const row of rows) {
        data[row.symbol] = {
          symbol: row.symbol,
          price: Number(row.lastPrice),
          change24h: Number(row.priceChangePercent),
          volume24h: Number(row.quoteVolume),
          high24h: Number(row.highPrice),
          low24h: Number(row.lowPrice),
          bid: Number(row.bidPrice),
          ask: Number(row.askPrice),
          trades: Number(row.count),
          exchangeTime: Number(row.closeTime),
          source: 'Binance',
        };
      }
      const latencyMs = Math.round(performance.now() - started);
      cache = { at: Date.now(), data };
      return NextResponse.json({ ...data, serverAt: new Date().toISOString(), cached: false, latencyMs }, { headers: { 'Cache-Control': 'no-store' } });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Live price unavailable', serverAt: new Date().toISOString(), cached: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
