import { NextRequest, NextResponse } from 'next/server';
import { evaluatePrediction, getLearningMetrics, listPredictions, getEvolutionSnapshot } from '@/lib/dro-learning';

export const dynamic = 'force-dynamic';

function clean(value: unknown, max = 40) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, max);
}

export async function GET(request: NextRequest) {
  const symbol = clean(request.nextUrl.searchParams.get('symbol') || '');
  return NextResponse.json({
    ok: true,
    service: 'DRO Learning Core',
    metrics: getLearningMetrics(symbol || undefined),
    evolution: getEvolutionSnapshot(symbol || undefined),
    recent: listPredictions(symbol || undefined),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const predictionId = clean(body?.predictionId, 80);
    const actualDirection = clean(body?.actualDirection, 20).toUpperCase();
    const outcome = clean(body?.outcome, 20).toUpperCase();
    if (!predictionId || !actualDirection || !['WIN', 'LOSS', 'NEUTRAL'].includes(outcome)) {
      return NextResponse.json({ ok: false, error: 'predictionId, actualDirection and outcome are required.' }, { status: 400 });
    }
    const evaluated = evaluatePrediction(predictionId, actualDirection, outcome as 'WIN' | 'LOSS' | 'NEUTRAL');
    if (!evaluated) return NextResponse.json({ ok: false, error: 'Prediction not found.' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      evaluated,
      metrics: getLearningMetrics(evaluated.symbol),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid learning feedback payload.' }, { status: 400 });
  }
}
