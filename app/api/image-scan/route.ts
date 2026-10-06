import { NextResponse } from 'next/server';
import { runImageEvidencePipeline } from '@/lib/image-evidence-pipeline';
import { guardRequest } from '@/lib/request-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_CHARS = 14_000_000;

export async function POST(request: Request) {
  const guard = await guardRequest(request);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.reason }, { status: guard.status });

  try {
    const body = await request.json();
    const imageData = typeof body?.imageData === 'string' ? body.imageData : '';
    if (!imageData) return NextResponse.json({ ok: false, error: 'IMAGE_DATA_REQUIRED' }, { status: 400 });
    if (imageData.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ ok: false, error: 'IMAGE_TOO_LARGE' }, { status: 413 });
    }

    const result = await runImageEvidencePipeline({
      imageData,
      symbol: typeof body?.symbol === 'string' ? body.symbol : undefined,
      interval: typeof body?.interval === 'string' ? body.interval : undefined,
      liveContext: body?.liveContext,
    });

    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      generatedAt: result.receivedAt,
      image: {
        available: result.vision.available,
        symbol: result.vision.symbol,
        timeframe: result.vision.timeframe,
        lastVisiblePrice: result.vision.lastVisiblePrice,
        direction: result.vision.direction,
        confidence: result.vision.confidence,
        visualQuality: result.vision.visualQuality,
        trend: result.vision.trend,
        marketStructure: result.vision.marketStructure,
        support: result.vision.support,
        resistance: result.vision.resistance,
        patterns: result.vision.patterns,
        liquidity: result.vision.liquidity,
        volumeContext: result.vision.volumeContext,
        indicatorContext: result.vision.indicatorContext,
        invalidation: result.vision.invalidation,
        evidence: result.evidence,
        uncertainty: result.vision.uncertainty,
      },
      imageTradePlan: result.imageTradePlan,
      analysis: result.cycle,
      warnings: result.warnings,
      pipeline: [
        'DATA_INGESTION',
        'IMAGE_SCANNER',
        'SPECIALIST_ANALYSTS',
        'EVIDENCE_AGGREGATOR',
        'DRO_DECISION',
        'THESIS_VALIDATION',
        'RISK_ENGINE',
        'SIGNAL_GENERATOR',
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IMAGE_SCAN_FAILED';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
