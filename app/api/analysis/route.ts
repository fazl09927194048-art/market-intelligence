import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams;
    const data = await getAdvancedMarketData(q.get('symbol') ?? 'BTCUSDT', q.get('interval') ?? '15m', q.get('limit') ?? '200');
    const usingSpot = data.spot.candles.length >= 20;
    const candles = usingSpot ? data.spot.candles : data.futures.candles;
    const bids = usingSpot ? data.spot.orderBook.bids : [];
    const asks = usingSpot ? data.spot.orderBook.asks : [];
    const technical = analyzeTechnical(candles, bids, asks);
    const usable = candles.length >= 20;
    return NextResponse.json({
      symbol: data.symbol,
      technical,
      market: { spotPrice:data.spot.price, futuresPrice:data.futures.price, fundingRate:data.futures.fundingRate, openInterest:data.futures.openInterest },
      sourceHealth:data.sourceHealth,
      warnings:[...data.warnings,...technical.warnings],
      dataValid:usable,
      fetchedAt:data.fetchedAt
    }, { status:usable ? 200 : 503, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
  } catch (error) {
    return NextResponse.json({
      symbol: qSymbol(request),
      dataValid:false,
      error:'Market analysis is temporarily unavailable.',
      detail:error instanceof Error ? error.message.slice(0,300) : 'Unknown market data error'
    }, { status:503, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
  }
}

function qSymbol(request: NextRequest) {
  const value = request.nextUrl.searchParams.get('symbol')?.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20);
  return value || 'BTCUSDT';
}
