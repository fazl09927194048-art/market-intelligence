import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { buildForecast, buildSignal } from '@/lib/signal';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const data = await getAdvancedMarketData(q.get('symbol') ?? 'BTCUSDT', q.get('interval') ?? '15m', q.get('limit') ?? '200');
  const candles = data.spot.candles.length ? data.spot.candles : data.futures.candles;
  const technical = analyzeTechnical(candles, data.spot.orderBook.bids, data.spot.orderBook.asks);
  const signal = buildSignal(data, technical);
  const forecast = buildForecast(data, technical);
  const dataValid = candles.length >= 20;
  return NextResponse.json({ symbol:data.symbol, signal, forecast, technical, market:{spotPrice:data.spot.price,futuresPrice:data.futures.price,fundingRate:data.futures.fundingRate,openInterest:data.futures.openInterest}, sourceHealth:data.sourceHealth, warnings:[...data.warnings,...technical.warnings], dataValid, fetchedAt:data.fetchedAt }, { status:dataValid?200:503, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
}
