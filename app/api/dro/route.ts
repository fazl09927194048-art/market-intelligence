import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { normalizeInterval } from '@/lib/chart-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanSymbol(value: unknown) {
  return String(value ?? 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'BTCUSDT';
}

export async function GET(request: NextRequest) {
  try {
    const symbol = cleanSymbol(request.nextUrl.searchParams.get('symbol'));
    const interval = normalizeInterval(request.nextUrl.searchParams.get('interval'), '15m');
    const cycle = await runIntelligenceCycle(symbol, interval);

    const plan = cycle.tradePlan;
    const decision = plan.status === 'SIGNAL' && (plan.side === 'LONG' || plan.side === 'SHORT')
      ? plan.side
      : 'WAIT';

    const thesisStatus =
      cycle.invalidation.status === 'NO_TRADE'
        ? 'INVALIDATED'
        : cycle.invalidation.status === 'CAUTION'
          ? 'WEAKENED'
          : 'VALID';

    return NextResponse.json({
      ok: true,
      engine: 'DRO',
      version: '1.0',
      generatedAt: cycle.generatedAt,
      cycleId: cycle.cycleId,
      symbol: cycle.symbol,
      interval: cycle.interval,
      decision,
      confidence: Number(cycle.consensus.confidence ?? plan.confidence ?? 0),
      thesis: {
        status: thesisStatus,
        statement: plan.analysis,
        invalidation: cycle.invalidation.reasons?.[0] ?? plan.invalidation,
      },
      signal: {
        side: decision === 'WAIT' ? 'NO TRADE' : decision,
        entry: plan.entry,
        stopLoss: plan.stopLoss,
        takeProfit: plan.takeProfit,
        takeProfits: plan.takeProfits,
        riskReward: plan.riskReward,
        horizonMinutes: plan.horizonMinutes,
      },
      evidence: {
        analystCount: cycle.analysts.length,
        consensus: cycle.consensus,
        intelligenceScore: cycle.intelligenceScore,
        marketRegime: cycle.marketRegime,
        liquidityBrain: cycle.liquidityBrain,
        multiTimeframe: cycle.multiTimeframe,
        decisionAudit: cycle.decisionAudit,
        invalidation: cycle.invalidation,
      },
      risk: cycle.risk,
      warnings: cycle.warnings,
      sourceHealth: cycle.sourceHealth,
      dataValid: cycle.dataValid,
      execution: {
        mode: 'ANALYSIS_ONLY',
        allowed: false,
        reason: 'DRO endpoint returns a decision object only; order execution remains isolated in the execution engine.',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      engine: 'DRO',
      error: error instanceof Error ? error.message : 'DRO_ANALYSIS_FAILED',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
