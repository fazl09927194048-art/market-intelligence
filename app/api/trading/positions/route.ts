import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {listExchanges} from '@/lib/exchange/db';
import {syncActiveTradeValuations} from '@/lib/trade-lifecycle';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const userId=await getSessionUserId(); let exchangeId=req.nextUrl.searchParams.get('exchangeId')||''; const symbol=req.nextUrl.searchParams.get('symbol')||undefined;
  if(!exchangeId){const xs=await listExchanges(userId);if(xs.length!==1)return NextResponse.json({ok:false,error:'Select exchangeId when multiple exchanges are connected.'},{status:409});exchangeId=String(xs[0].id)}
  const sync=await syncActiveTradeValuations(userId,exchangeId,symbol);
  return NextResponse.json({ok:true,exchangeId,symbol: symbol||null,...sync},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Position sync failed'},{status:502})}
}