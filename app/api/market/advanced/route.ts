import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const data = await getAdvancedMarketData(
    searchParams.get('symbol') ?? 'BTCUSDT',
    searchParams.get('interval') ?? '1m',
    searchParams.get('limit') ?? '100',
  );

  const hasAnyData = Boolean(
    data.spot.price !== null ||
    data.spot.candles.length ||
    data.spot.orderBook.bids.length ||
    data.spot.orderBook.asks.length ||
    data.futures.price !== null ||
    data.futures.candles.length,
  );

  return NextResponse.json(data, {
    status: hasAnyData ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
