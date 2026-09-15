import { NextResponse } from 'next/server';
import { getMarketService } from '@/lib/market-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const market = await getMarketService();
    const dataValid = market.markets.length > 0 && market.markets.every(x => x.quality === 'live');
    return NextResponse.json({
      ok: true,
      service: 'market-intelligence',
      timestamp: new Date().toISOString(),
      market: {
        provider: market.provider,
        selectedProvider: market.selectedProvider,
        attemptedProviders: market.attemptedProviders,
        dataAvailable: market.markets.length > 0,
        dataValid,
        sourceHealth: market.sourceHealth,
        warnings: market.warnings,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({
      ok: false,
      service: 'market-intelligence',
      timestamp: new Date().toISOString(),
      market: { provider: 'unavailable', selectedProvider: 'unavailable', attemptedProviders: [], dataAvailable: false, dataValid: false, sourceHealth: {}, warnings: ['Health check failed safely.'] },
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
