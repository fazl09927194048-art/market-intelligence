import { NextResponse } from 'next/server';
import { runImageEvidencePipeline } from '@/lib/image-evidence-pipeline';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_CHARS = 14_000_000;
const MAX_BODY_BYTES = 16_000_000;

export async function POST(request: Request) {
  if (tooLarge(request, MAX_BODY_BYTES)) return NextResponse.json({ ok: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
  const rate = consumeRateLimit(request, 'image-scan', 8);
  if (!rate.allowed) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryAfter: rate.retryAfter }, { status: 429 });
  try {
    const body = await request.json();
    const imageData = typeof body?.imageData === 'string' ? body.imageData : '';
    if (!imageData) return NextResponse.json({ ok: false, error: 'IMAGE_DATA_REQUIRED' }, { status: 400 });
    if (imageData.length > MAX_IMAGE_CHARS) return NextResponse.json({ ok: false, error: 'IMAGE_TOO_LARGE' }, { status: 413 });
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
        available: result.vision.available, symbol: result.vision.symbol, timeframe: result.vision.timeframe,
        lastVisiblePrice: result.vision.lastVisiblePrice, direction: result.vision.direction,
        confidence: result.vision.confidence, visualQuality: result.vision.visualQuality,
        trend: result.vision.trend, marketStructure: result.vision.marketStructure,
        support: result.vision.support, resistance: result.vision.resistance, patterns: result.vision.patterns,
        liquidity: result.vision.liquidity, volumeContext: result.vision.volumeContext,
        indicatorContext: result.vision.indicatorContext, invalidation: result.vision.invalidation,
        evidence: result.evidence, uncertainty: result.vision.uncertainty,
      },
      imageTradePlan: result.imageTradePlan,
      analysis: result.cycle,
      warnings: result.warnings,
      pipeline: ['DATA_INGESTION','IMAGE_SCANNER','SPECIALIST_ANALYSTS','EVIDENCE_AGGREGATOR','DRO_DECISION','THESIS_VALIDATION','RISK_ENGINE','SIGNAL_GENERATOR'],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'IMAGE_SCAN_FAILED' }, { status: 500 });
  }
}
