import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const data = await getAdvancedMarketData(q.get('symbol') ?? 'BTCUSDT', q.get('interval') ?? '15m', q.get('limit') ?? '200');
  const technical = analyzeTechnical(data.spot.candles.length ? data.spot.candles : data.futures.candles, data.spot.orderBook.bids, data.spot.orderBook.asks);
  const usable = data.spot.candles.length >= 20 || data.futures.candles.length >= 20;
  return NextResponse.json({ symbol:data.symbol, technical, market:{spotPrice:data.spot.price,futuresPrice:data.futures.price,fundingRate:data.futures.fundingRate,openInterest:data.futures.openInterest}, sourceHealth:data.sourceHealth, warnings:[...data.warnings,...technical.warnings], dataValid:usable, fetchedAt:data.fetchedAt }, { status:usable?200:503, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
}
