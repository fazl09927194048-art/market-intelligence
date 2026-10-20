import { NextResponse } from 'next/server';
import { getMarketService } from '@/lib/market-provider';
import { getPersistentMetrics } from '@/lib/dro-learning-db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Safe operational status for the DRO workspace.
 * Never returns secret values, connection strings, or provider credentials.
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  const chatConfigured = Boolean(process.env.DRO_CHAT_API_KEY || process.env.OPENAI_API_KEY);
  const visionConfigured = Boolean(process.env.DRO_VISION_API_KEY || process.env.OPENAI_API_KEY);
  const databaseConfigured = Boolean(process.env.DATABASE_URL);

  let market: Record<string, unknown> = {
    available: false,
    provider: 'unavailable',
    dataValid: false,
    warnings: ['Market status has not been checked.'],
  };
  let marketOk = false;
  try {
    const result = await getMarketService();
    const live = result.markets.filter(item => item.quality === 'live');
    marketOk = live.length > 0;
    market = {
      available: result.markets.length > 0,
      provider: result.selectedProvider,
      dataValid: result.markets.length > 0 && live.length === result.markets.length,
      marketCount: result.markets.length,
      fetchedAt: result.fetchedAt,
      sourceHealth: result.sourceHealth,
      warnings: result.warnings,
    };
  } catch {
    market = { available: false, provider: 'unavailable', dataValid: false, warnings: ['Market provider check failed.'] };
  }

  let database: Record<string, unknown> = {
    configured: databaseConfigured,
    reachable: false,
    status: databaseConfigured ? 'CHECK_FAILED' : 'NOT_CONFIGURED',
  };
  try {
    if (databaseConfigured) {
      const metrics = await getPersistentMetrics();
      database = {
        configured: true,
        reachable: metrics !== null,
        status: metrics !== null ? 'CONNECTED' : 'NOT_CONNECTED',
        learningSamples: metrics?.samples ?? null,
        evaluatedSamples: metrics?.evaluated ?? null,
      };
    }
  } catch {
    database = { configured: true, reachable: false, status: 'CHECK_FAILED' };
  }

  const coreReady = marketOk;
  return NextResponse.json({
    ok: coreReady,
    service: 'DRO',
    timestamp,
    readiness: coreReady ? 'READY_WITH_CHECKS' : 'DEGRADED',
    capabilities: {
      internalMarketEngine: true,
      chatProvider: chatConfigured ? 'configured' : 'not_configured_using_internal_fallback',
      imageVisionProvider: visionConfigured ? 'configured' : 'not_configured',
      persistentLearning: databaseConfigured ? 'configured' : 'not_configured',
    },
    market,
    database,
    notes: [
      'Provider configured means environment settings are present; it does not guarantee successful inference.',
      'Market readiness does not certify trade execution or profitability.',
    ],
  }, {
    status: coreReady ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
