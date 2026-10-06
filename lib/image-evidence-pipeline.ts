import { analyzeChartImage, buildImageTradePlan, type ImageTradePlan } from './chart-vision';
import { runIntelligenceCycle } from './intelligence-loop';
import type { ChartVisionContext } from './signal';

export type ImageEvidencePacket = {
  requestId: string;
  receivedAt: string;
  source: 'image';
  vision: ChartVisionContext & { available: boolean; error?: string };
  imageTradePlan: ImageTradePlan;
  cycle: Awaited<ReturnType<typeof runIntelligenceCycle>> | null;
  evidence: string[];
  warnings: string[];
};

function id() { return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10); }

export async function runImageEvidencePipeline(input: { imageData: string; symbol?: string; interval?: string; liveContext?: unknown; }): Promise<ImageEvidencePacket> {
  const requestId = id();
  const receivedAt = new Date().toISOString();
  const imageData = input.imageData || '';
  const validPrefix = imageData.startsWith('data:image/png;base64,') || imageData.startsWith('data:image/jpeg;base64,') || imageData.startsWith('data:image/jpg;base64,') || imageData.startsWith('data:image/webp;base64,') || imageData.startsWith('data:image/gif;base64,');
  if (!validPrefix) throw new Error('IMAGE_DATA_URL_REQUIRED');

  const vision = await analyzeChartImage(imageData, {
    symbol: input.symbol ?? null,
    interval: input.interval ?? null,
    ...(typeof input.liveContext === 'object' && input.liveContext ? input.liveContext : {}),
  });

  const imageTradePlan = buildImageTradePlan(vision);
  const symbol = String(input.symbol || vision.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const interval = String(input.interval || vision.timeframe || '15m');
  const warnings: string[] = [...(vision.uncertainty ?? [])];
  const evidence: string[] = [...(vision.evidence ?? [])];
  if (vision.trend) evidence.push('Visible trend: ' + vision.trend);
  if (vision.marketStructure) evidence.push('Visible market structure: ' + vision.marketStructure);
  if (vision.liquidity) evidence.push('Visible liquidity context: ' + vision.liquidity);
  if (vision.volumeContext) evidence.push('Visible volume context: ' + vision.volumeContext);
  if (vision.indicatorContext) evidence.push('Visible indicators: ' + vision.indicatorContext);

  let cycle: ImageEvidencePacket['cycle'] = null;
  try {
    cycle = await runIntelligenceCycle(symbol, interval, {
      source: 'browser',
      symbol,
      interval,
      pagePrice: vision.lastVisiblePrice ?? null,
      observedAt: receivedAt,
      extraction: 'none',
      quality: vision.available ? 'verified' : 'none',
      ageMs: 0,
    }, vision);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'INTELLIGENCE_CYCLE_FAILED');
  }

  if (!vision.available) warnings.push('Semantic vision was unavailable; no visual fact is treated as verified.');
  if (!imageTradePlan.available) warnings.push(...imageTradePlan.warnings);
  return { requestId, receivedAt, source: 'image', vision, imageTradePlan, cycle, evidence, warnings };
}
