import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { normalizeInterval } from '@/lib/chart-context';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  try {
    const symbol = q.get('symbol') ?? 'BTCUSDT';
    const interval = normalizeInterval(q.get('interval'));
    const pagePriceRaw = Number(q.get('pagePrice'));
    const pagePrice = Number.isFinite(pagePriceRaw) && pagePriceRaw > 0 ? pagePriceRaw : null;
    const extraction = q.get('extraction');
    const chartContext = pagePrice !== null || extraction ? {
      source: 'browser' as const,
      symbol,
      interval,
      pagePrice,
      observedAt: q.get('observedAt') ?? new Date().toISOString(),
      extraction: extraction === 'dom' || extraction === 'url' ? extraction : 'none' as const,
    } : null;
    const result = await runIntelligenceCycle(symbol, interval, chartContext);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intelligence cycle failed', dataValid:false }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
}
