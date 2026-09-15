import { NextRequest, NextResponse } from 'next/server';
import { getMarkets } from '@/lib/market';
import { analyzeMarket } from '@/lib/intelligence';

export const dynamic = 'force-dynamic';

function corsHeaders(request: NextRequest): Record<string,string> {
  const origin=request.headers.get('origin');
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(origin && allowed.includes(origin)) return {'Access-Control-Allow-Origin':origin,Vary:'Origin'};
  return {};
}

export async function GET(request: NextRequest) {
  const cors=corsHeaders(request);
  try {
    const market=await getMarkets();
    const intelligence=analyzeMarket(market.markets);
    return NextResponse.json({intelligence,marketProvider:market.provider,sourceHealth:market.sourceHealth,dataValid:market.markets.length>0&&market.markets.every(x=>x.quality==='live'),warnings:market.warnings,updatedAt:market.fetchedAt},{headers:{'Cache-Control':'no-store',...cors}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Intelligence unavailable',dataValid:false},{status:503,headers:{'Cache-Control':'no-store',...cors}});
  }
}
