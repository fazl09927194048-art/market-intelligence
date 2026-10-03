import { NextRequest, NextResponse } from 'next/server';
import { evaluateCandidate } from '@/lib/dro-evolution';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const candidate = body?.candidate;
    const baseline = body?.baseline ?? null;
    if (!candidate || typeof candidate.accuracy !== 'number' || typeof candidate.winRate !== 'number' ||
        typeof candidate.calibrationGap !== 'number' || typeof candidate.samples !== 'number') {
      return NextResponse.json({ ok:false, error:'Candidate metrics are incomplete.' }, {status:400});
    }
    const decision = evaluateCandidate(candidate, baseline);
    return NextResponse.json({
      ok:true,
      service:'DRO Evolution Gate',
      decision,
      rule:'candidate → evaluation → gate → promote/hold/rollback',
      productionAutoEdit:false,
    }, {headers:{'Cache-Control':'no-store'}});
  } catch {
    return NextResponse.json({ok:false,error:'Invalid evolution payload.'},{status:400});
  }
}
