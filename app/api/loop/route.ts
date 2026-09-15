import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { normalizeInterval } from '@/lib/chart-context';
import { consumeRateLimit } from '@/lib/request-guard';

export const dynamic = 'force-dynamic';

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (origin && configured.includes(origin)) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return {};
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request);
  const guard = consumeRateLimit(request, 'intelligence-loop', 30);
  if (!guard.allowed) return NextResponse.json({ error: 'Too many intelligence requests. Please retry shortly.', dataValid: false, retryAfterMs: guard.retryAfter * 1000 }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(guard.retryAfter), ...cors } });
  try {
    const q = new URL(request.url).searchParams;
    const rawSymbol = q.get('symbol') ?? 'BTCUSDT';
    const symbol = /^[A-Z0-9]{2,20}$/i.test(rawSymbol) ? rawSymbol.toUpperCase() : 'BTCUSDT';
    const interval = normalizeInterval(q.get('interval'));
    const pagePriceRaw = Number(q.get('pagePrice'));
    const pagePrice = Number.isFinite(pagePriceRaw) && pagePriceRaw > 0 ? pagePriceRaw : null;
    const extractionRaw = q.get('extraction');
    const extraction: 'dom' | 'url' | 'none' = extractionRaw === 'dom' || extractionRaw === 'url' ? extractionRaw : 'none';
    const chartContext = pagePrice !== null || extractionRaw ? {
      source: 'browser' as const,
      symbol,
      interval,
      pagePrice,
      observedAt: q.get('observedAt') ?? new Date().toISOString(),
      extraction,
    } : null;
    const result = await runIntelligenceCycle(symbol, interval, chartContext);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', ...cors } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Intelligence cycle failed', dataValid: false },
      { status: 503, headers: { 'Cache-Control': 'no-store', ...cors } },
    );
  }
}
