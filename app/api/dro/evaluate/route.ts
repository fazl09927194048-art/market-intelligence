import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { evaluateDuePredictions } from '@/lib/dro-learning-db';

export const dynamic = 'force-dynamic';

function allowed(request: NextRequest) {
  const configured = process.env.DRO_EVALUATION_SECRET;
  if (!configured) return false;
  return request.headers.get('x-dro-evaluation-secret') === configured;
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) {
    return NextResponse.json(
      { ok: false, error: 'Evaluation endpoint is not configured for external execution.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const result = await evaluateDuePredictions(async (symbol, interval) => {
    const live = await getAdvancedMarketData(symbol, interval, 20);
    const price = Number(live?.futures?.price ?? live?.spot?.price);
    if (!Number.isFinite(price)) return null;
    const change = Number(live?.futures?.change24h ?? live?.spot?.change24h ?? 0);
    if (!Number.isFinite(change)) return null;
    if (Math.abs(change) < 0.02) return 'NEUTRAL';
    return change > 0 ? 'LONG' : 'SHORT';
  });

  return NextResponse.json(
    { ok: true, service: 'DRO Evaluation Engine', result },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
