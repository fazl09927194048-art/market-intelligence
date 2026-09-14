import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  try {
    const result = await runIntelligenceCycle(q.get('symbol') ?? 'BTCUSDT', q.get('interval') ?? '15m');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intelligence cycle failed', dataValid:false }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  }
}
