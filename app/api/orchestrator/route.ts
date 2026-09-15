import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { normalizeInterval } from '@/lib/chart-context';
import { orchestrateAnalysts } from '@/lib/master-orchestrator';
import { consumeRateLimit } from '@/lib/request-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = consumeRateLimit(request, 'master-orchestrator', 20);
  if (!guard.allowed) {
    return NextResponse.json({ error: 'Too many orchestration requests. Please retry shortly.', dataValid: false, retryAfterMs: guard.retryAfter * 1000 }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(guard.retryAfter) } });
  }

  try {
    const q = new URL(request.url).searchParams;
    const rawSymbol = q.get('symbol') ?? 'BTCUSDT';
    const symbol = /^[A-Z0-9]{2,20}$/i.test(rawSymbol) ? rawSymbol.toUpperCase() : 'BTCUSDT';
    const interval = normalizeInterval(q.get('interval'));
    const cycle = await runIntelligenceCycle(symbol, interval);
    const orchestration = orchestrateAnalysts(symbol, interval, cycle.analysts, cycle.consensus);
    return NextResponse.json({
      cycleId: cycle.cycleId,
      generatedAt: cycle.generatedAt,
      symbol,
      interval,
      dataValid: cycle.dataValid,
      consensus: cycle.consensus,
      orchestration,
      warnings: cycle.warnings,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Master orchestration failed safely.', dataValid: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
