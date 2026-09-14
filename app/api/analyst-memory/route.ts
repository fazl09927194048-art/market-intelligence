import { NextRequest, NextResponse } from 'next/server';
import { getAllAnalystProfiles, getAnalystMemory, recordAnalystOutcome } from '../../../lib/analyst-memory';
import { ANALYSTS } from '../../../lib/analysts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const analystId = request.nextUrl.searchParams.get('analyst');
  if (analystId) {
    const known = ANALYSTS.some(a => a.id === analystId);
    if (!known) return NextResponse.json({ error: 'Unknown analyst' }, { status: 404 });
    return NextResponse.json({ profile: getAllAnalystProfiles([analystId])[0], memories: getAnalystMemory(analystId, 100) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ profiles: getAllAnalystProfiles(ANALYSTS.map(a => a.id)), count: ANALYSTS.length }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const analystId = String(body?.analystId ?? '');
    if (!ANALYSTS.some(a => a.id === analystId)) return NextResponse.json({ error: 'Unknown analyst' }, { status: 404 });
    const outcome = body?.outcome;
    if (!['WIN', 'LOSS', 'INVALIDATED', 'OPEN'].includes(outcome)) return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
    const returnPct = Number(body?.returnPct ?? 0);
    const lesson = String(body?.lesson ?? '').slice(0, 1000);
    const record = recordAnalystOutcome(analystId, String(body?.symbol ?? 'UNKNOWN'), String(body?.regime ?? 'UNKNOWN'), outcome, Number.isFinite(returnPct) ? returnPct : 0, lesson);
    return NextResponse.json({ record, profile: getAllAnalystProfiles([analystId])[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
