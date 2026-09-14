import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getMarkets();
  return NextResponse.json({ ...result, updatedAt: new Date().toISOString(), dataAvailable: result.markets.length > 0 }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
