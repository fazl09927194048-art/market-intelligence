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

  const result = await evaluateDuePredictions(async ({ symbol, interval, direction, entry, target, stopLoss }) => {
    const live = await getAdvancedMarketData(symbol, interval, 40);
    const price = Number(live?.futures?.price ?? live?.spot?.price);
    if (!Number.isFinite(price)) return null;
    const side = String(direction).toUpperCase();
    if (side === 'NO TRADE' || entry == null) return { outcome: 'NEUTRAL', actualDirection: 'NO TRADE' };
    const px = Number(price);
    const en = Number(entry);
    const tp = target == null ? null : Number(target);
    const sl = stopLoss == null ? null : Number(stopLoss);
    if (side === 'LONG') {
      if (tp !== null && px >= tp) return { outcome: 'WIN', actualDirection: 'LONG' };
      if (sl !== null && px <= sl) return { outcome: 'LOSS', actualDirection: 'SHORT' };
    }
    if (side === 'SHORT') {
      if (tp !== null && px <= tp) return { outcome: 'WIN', actualDirection: 'SHORT' };
      if (sl !== null && px >= sl) return { outcome: 'LOSS', actualDirection: 'LONG' };
    }
    const distance = Math.abs(px - en) / Math.max(Math.abs(en), 1);
    if (distance < 0.001) return { outcome: 'NEUTRAL', actualDirection: side };
    return { outcome: side === (px > en ? 'LONG' : 'SHORT') ? 'WIN' : 'LOSS', actualDirection: px > en ? 'LONG' : 'SHORT' };
  });

  return NextResponse.json(
    { ok: true, service: 'DRO Evaluation Engine', result },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
