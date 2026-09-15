import { NextResponse } from 'next/server';
import { getForecastMetrics } from '@/lib/persistent-memory';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get('symbol')?.toUpperCase() || undefined;

  try {
    const metrics = await getForecastMetrics(symbol);
    return NextResponse.json(
      {
        enabled: Boolean(process.env.DATABASE_URL),
        symbol: symbol ?? 'ALL',
        metrics,
        dataValid: metrics !== null || !process.env.DATABASE_URL,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        enabled: Boolean(process.env.DATABASE_URL),
        symbol: symbol ?? 'ALL',
        metrics: null,
        dataValid: false,
        warning: 'Forecast metrics are temporarily unavailable.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
