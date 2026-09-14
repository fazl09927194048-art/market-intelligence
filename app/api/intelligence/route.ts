import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';
import { analyzeMarket } from '@/lib/intelligence';

export const dynamic = 'force-dynamic';

export async function GET() {
  const market = await getMarkets();
  const intelligence = analyzeMarket(market.markets);

  return NextResponse.json({
    intelligence,
    marketProvider: market.provider,
    sourceHealth: market.sourceHealth,
    dataValid: market.markets.length > 0 && market.markets.every(x => x.quality === 'live'),
    warnings: market.warnings,
    updatedAt: market.fetchedAt,
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
