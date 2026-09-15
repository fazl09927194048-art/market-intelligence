import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const interval = (request.nextUrl.searchParams.get('interval') || '15m').replace(/[^0-9a-zA-Z]/g, '');
  const limit = Math.min(500, Math.max(50, Number(request.nextUrl.searchParams.get('limit') || 200)));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal: controller.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`Klines ${r.status}`);
    const rows = await r.json() as unknown[][];
    const candles = rows.map(x => ({ time:Number(x[0]), open:Number(x[1]), high:Number(x[2]), low:Number(x[3]), close:Number(x[4]), volume:Number(x[5]), closeTime:Number(x[6]), quoteVolume:Number(x[7]), trades:Number(x[8]), takerBuyBaseVolume:Number(x[9]), takerBuyQuoteVolume:Number(x[10]) }));
    const buyVolume = candles.reduce((s,c) => s + c.takerBuyQuoteVolume, 0);
    const totalVolume = candles.reduce((s,c) => s + c.quoteVolume, 0);
    return NextResponse.json({ symbol, interval, candles, volume: totalVolume, buyVolume, sellVolume: Math.max(0,totalVolume-buyVolume), source:'Binance', fetchedAt:new Date().toISOString() }, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Candles unavailable'},{status:503}); }
  finally { clearTimeout(timer); }
}
