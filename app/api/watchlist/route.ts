import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/request-guard';
import { addCustomMarketSymbol, getCustomMarketSymbols } from '@/lib/shared-watchlist';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const symbols = await getCustomMarketSymbols();
    return NextResponse.json({ ok: true, symbols, storage: process.env.DATABASE_URL ? 'shared-database' : 'unconfigured' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, symbols: [], error: 'Shared watchlist is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const limit = consumeRateLimit(request, 'shared-watchlist-write', 5);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many watchlist changes. Try again shortly.' }, {
      status: 429, headers: { 'Retry-After': String(limit.retryAfter), 'Cache-Control': 'no-store' },
    });
  }
  try {
    const body = await request.json();
    const raw = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
    const symbol = raw.endsWith('USDT') ? raw.slice(0, -4) : raw;
    if (!/^[A-Z0-9]{2,15}$/.test(symbol)) {
      return NextResponse.json({ ok: false, error: 'Enter a valid base symbol, e.g. BTC, ETH, or SUI.' }, { status: 400 });
    }
    const symbols = await addCustomMarketSymbol(symbol);
    return NextResponse.json({ ok: true, symbol, symbols, message: 'Saved to the shared watchlist. Market data appears when a provider supports this symbol.' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('DATABASE_URL')
      ? error.message
      : 'Could not save the shared watchlist. Check database connectivity.';
    return NextResponse.json({ ok: false, error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
