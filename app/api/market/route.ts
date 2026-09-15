import {NextResponse} from 'next/server';
import {getMarketService} from '@/lib/market-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getMarketService();
    const dataValid = result.markets.length > 0 && result.markets.every(x => x.quality === 'live');
    return NextResponse.json({
      markets: result.markets,
      provider: result.provider,
      selectedProvider: result.selectedProvider,
      attemptedProviders: result.attemptedProviders,
      sourceHealth: result.sourceHealth,
      warnings: result.warnings,
      dataValid,
      dataAvailable: result.markets.length > 0,
      updatedAt: result.fetchedAt,
    }, {status: result.markets.length > 0 ? 200 : 503, headers: {'Cache-Control': 'no-store'}});
  } catch {
    return NextResponse.json({markets: [], provider: 'unavailable', dataValid: false, dataAvailable: false, warnings: ['Market service failed safely.']}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}
