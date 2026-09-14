import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getMarkets();
  const dataValid = result.markets.length > 0 && result.markets.every(x => x.quality === 'live');

  return NextResponse.json({
    markets: result.markets,
    provider: result.provider,
    sourceHealth: result.sourceHealth,
    warnings: result.warnings,
    dataValid,
    dataAvailable: result.markets.length > 0,
    updatedAt: result.fetchedAt,
  }, {
    status: result.markets.length > 0 ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
