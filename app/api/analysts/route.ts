import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { analyzeTechnical } from '@/lib/technical';
import { runAnalystBrain, synthesizeOpinions } from '@/lib/analyst-brain';
import { enrichNews } from '@/lib/news-intelligence';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const q=new URL(request.url).searchParams; const symbol=q.get('symbol')??'BTCUSDT'; const interval=q.get('interval')??'15m';
 try{
  const data=await getAdvancedMarketData(symbol,interval,200); const candles=data.futures.candles.length>=20?data.futures.candles:data.spot.candles;
  const technical=analyzeTechnical(candles,data.spot.orderBook.bids,data.spot.orderBook.asks);
  const opinions=runAnalystBrain(data,technical,enrichNews([]));
  return NextResponse.json({symbol,interval,analysts:opinions,consensus:synthesizeOpinions(opinions),dataQuality:technical.confidence,sourceHealth:data.sourceHealth,warnings:[...data.warnings,...technical.warnings]},{headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
 }catch(error){ return NextResponse.json({error:error instanceof Error?error.message:'Analyst engine failed',dataValid:false},{status:503}); }
}
