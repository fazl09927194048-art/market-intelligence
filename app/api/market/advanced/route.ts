import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { consumeRateLimit } from '@/lib/request-guard';

export const dynamic = 'force-dynamic';

function corsHeaders(request: NextRequest): Record<string,string> {
  const origin=request.headers.get('origin');
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(origin&&allowed.includes(origin)) return {'Access-Control-Allow-Origin':origin,Vary:'Origin'};
  return {};
}

export async function GET(request: NextRequest) {
  const guard=consumeRateLimit(request,'market-advanced',60);
  const cors=corsHeaders(request);
  if(!guard.allowed) return NextResponse.json({error:'Too many market-data requests. Please retry shortly.',retryAfterMs:guard.retryAfter*1000},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(guard.retryAfter),...cors}});
  try {
    const { searchParams } = new URL(request.url);
    const rawSymbol=searchParams.get('symbol') ?? 'BTCUSDT';
    const symbol=/^[A-Z0-9]{2,20}$/i.test(rawSymbol)?rawSymbol.toUpperCase():'BTCUSDT';
    const data = await getAdvancedMarketData(symbol, searchParams.get('interval') ?? '1m', searchParams.get('limit') ?? '100');
    const hasAnyData = Boolean(
      data.spot.price !== null || data.spot.candles.length || data.spot.orderBook.bids.length || data.spot.orderBook.asks.length || data.futures.price !== null || data.futures.candles.length,
    );
    return NextResponse.json(data,{status:hasAnyData?200:503,headers:{'Cache-Control':'no-store',...cors}});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Advanced market data unavailable'},{status:503,headers:{'Cache-Control':'no-store',...cors}});
  }
}
