import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';
import { addCustomMarketSymbol, getCustomMarketSymbols, removeCustomMarketSymbol } from '@/lib/shared-watchlist';
import { clearMarketServiceCache } from '@/lib/market-provider';

export const dynamic = 'force-dynamic';

function mutationRequestError(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
  if (!origin || !host) {
    return NextResponse.json({ ok: false, error: 'A same-origin browser request is required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'Cross-origin watchlist changes are not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request origin.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'Content-Type must be application/json.' }, { status: 415, headers: { 'Cache-Control': 'no-store' } });
  }
  if (tooLarge(request, 1024)) {
    return NextResponse.json({ ok: false, error: 'Request body is too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

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
  const requestError = mutationRequestError(request);
  if (requestError) return requestError;
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
    clearMarketServiceCache();
    return NextResponse.json({ ok: true, symbol, symbols, message: 'Saved to the shared watchlist. Market data appears when a provider supports this symbol.' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const isConfig = detail.includes('DATABASE_URL');
    const isFull = detail.includes('watchlist is full');
    const message = isConfig || isFull ? detail : 'Could not save the shared watchlist. Check database connectivity.';
    return NextResponse.json({ ok: false, error: message }, { status: isFull ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request: NextRequest) {
  const requestError = mutationRequestError(request);
  if (requestError) return requestError;
  const limit = consumeRateLimit(request, 'shared-watchlist-write', 5);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many watchlist changes. Try again shortly.' }, {
      status: 429, headers: { 'Retry-After': String(limit.retryAfter), 'Cache-Control': 'no-store' },
    });
  }
  try {
    const body = await request.json();
    const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase().replace(/USDT$/, '') : '';
    if (!/^[A-Z0-9]{2,15}$/.test(symbol)) {
      return NextResponse.json({ ok: false, error: 'Invalid ticker symbol.' }, { status: 400 });
    }
    const symbols = await removeCustomMarketSymbol(symbol);
    clearMarketServiceCache();
    return NextResponse.json({ ok: true, symbols, removed: symbol }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    const isConfig = detail.includes('DATABASE_URL');
    const message = isConfig ? detail : 'Could not update the shared watchlist. Check database connectivity.';
    return NextResponse.json({ ok: false, error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
