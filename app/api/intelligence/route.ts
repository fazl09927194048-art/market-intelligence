import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';
import { analyzeMarket } from '@/lib/intelligence';

export const dynamic='force-dynamic';

export async function GET(){
  const market=await getMarkets();
  const intelligence=analyzeMarket(market.markets);
  return NextResponse.json({intelligence,marketProvider:market.provider,warnings:market.warnings,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
