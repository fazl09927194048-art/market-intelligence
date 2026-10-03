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

  const result = await evaluateDuePredictions(async ({ symbol, interval, direction, entry }) => {
    const live = await getAdvancedMarketData(symbol, interval, 20);
    const price = Number(live?.futures?.price ?? live?.spot?.price);
    if (!Number.isFinite(price)) return null;
    if (String(direction).toUpperCase() === 'NO TRADE' || entry == null) return 'NEUTRAL';
    const distance = Math.abs(price - Number(entry)) / Math.max(Math.abs(Number(entry)), 1);
    if (distance < 0.001) return 'NEUTRAL';
    return price > Number(entry) ? 'LONG' : 'SHORT';
  });

  return NextResponse.json(
    { ok: true, service: 'DRO Evaluation Engine', result },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
