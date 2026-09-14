import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';
import { getMarketGlobalMetrics } from '@/lib/market-global';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
  const period = url.searchParams.get('period') || '5m';

  const [markets, global] = await Promise.all([
    getMarkets(),
    getMarketGlobalMetrics(symbol, period),
  ]);

  const advancing = markets.markets.filter(m => m.change24h > 0).length;
  const declining = markets.markets.filter(m => m.change24h < 0).length;
  const unchanged = markets.markets.length - advancing - declining;

  const body = {
    ...global,
    breadth: {
      advancing,
      declining,
      unchanged,
      total: markets.markets.length,
    },
    marketSnapshot: markets.markets,
    marketProvider: markets.provider,
    marketSourceHealth: markets.sourceHealth,
    dataValid: markets.markets.length > 0 && markets.markets.every(m => m.quality === 'live'),
    warnings: [...global.warnings, ...markets.warnings],
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: markets.markets.length > 0 || global.totalMarketCapUsd !== null ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
