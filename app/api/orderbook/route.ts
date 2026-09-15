import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const TIMEOUT_MS = 2500;

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const limit = Math.min(100, Math.max(20, Number(request.nextUrl.searchParams.get('limit') || 50)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const started = performance.now();
    const response = await fetch(`https://data-api.binance.vision/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Order book ${response.status}`);
    const book = await response.json() as { lastUpdateId?: number; bids?: string[][]; asks?: string[][] };
    const bids = (book.bids || []).map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity), value: Number(price) * Number(quantity) }));
    const asks = (book.asks || []).map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity), value: Number(price) * Number(quantity) }));
    const buyValue = bids.reduce((sum, x) => sum + x.value, 0);
    const sellValue = asks.reduce((sum, x) => sum + x.value, 0);
    const total = buyValue + sellValue;
    const buyPct = total ? buyValue / total * 100 : 0;
    return NextResponse.json({ symbol, bids, asks, buyValue, sellValue, buyPct, sellPct: 100 - buyPct, imbalance: buyValue - sellValue, lastUpdateId: book.lastUpdateId, latencyMs: Math.round(performance.now() - started), source: 'Binance', fetchedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Order book unavailable' }, { status: 503 });
  } finally { clearTimeout(timer); }
}
