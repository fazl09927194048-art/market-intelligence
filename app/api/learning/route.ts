import { NextResponse } from 'next/server';
import type { SignalResult } from '@/lib/signal';
import { evaluateSignal, summarizeLearning, type SignalEvaluation } from '@/lib/learning';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { signal?: SignalResult; futurePrices?: number[]; evaluations?: SignalEvaluation[]; signals?: SignalResult[] };
    if (body.signal && Array.isArray(body.futurePrices)) {
      const evaluation = evaluateSignal(body.signal, body.futurePrices);
      const evaluations = [...(body.evaluations ?? []), evaluation];
      return NextResponse.json({ evaluation, metrics: summarizeLearning(evaluations, body.signals ?? [body.signal]) }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
    }
    const evaluations = Array.isArray(body.evaluations) ? body.evaluations : [];
    return NextResponse.json({ metrics: summarizeLearning(evaluations, body.signals ?? []) }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  } catch {
    return NextResponse.json({ error: 'Invalid learning payload.' }, { status: 400, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
}
