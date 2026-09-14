import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { runBacktest } from '@/lib/backtest';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const data = await getAdvancedMarketData(q.get('symbol') ?? 'BTCUSDT', q.get('interval') ?? '15m', q.get('limit') ?? '500');
  const candles = data.futures.candles.length >= 20 ? data.futures.candles : data.spot.candles;
  if (candles.length < 80) return NextResponse.json({ error:'Insufficient historical candles for backtest.', dataValid:false, sourceHealth:data.sourceHealth, warnings:data.warnings }, { status:503, headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
  const lookahead = Math.max(2, Math.min(48, Number(q.get('lookahead') ?? 12) || 12));
  return NextResponse.json({ symbol:data.symbol, interval:q.get('interval') ?? '15m', lookahead, result:runBacktest(candles, lookahead), dataValid:true, sourceHealth:data.sourceHealth, warnings:data.warnings }, { headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'} });
}
