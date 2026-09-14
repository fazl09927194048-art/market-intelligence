import { NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';

export const dynamic='force-dynamic';

export async function GET(){
  const market=await getMarkets();
  return NextResponse.json({ok:true,service:'market-intelligence',timestamp:new Date().toISOString(),market:{provider:market.provider,dataAvailable:market.markets.length>0,warnings:market.warnings}});
}
