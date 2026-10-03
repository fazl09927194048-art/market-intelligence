import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {listExchanges} from '@/lib/exchange/db';
import {reconcileOrderLifecycle} from '@/lib/trade-lifecycle';

export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  const body=await req.json().catch(()=>({}));
  let exchangeId=String(body.exchangeId||'');
  const symbol=body.symbol?String(body.symbol).toUpperCase():undefined;
  if(!exchangeId){
   const xs=await listExchanges(userId);
   if(xs.length!==1)return NextResponse.json({ok:false,error:'Select exchangeId when multiple exchanges are connected.'},{status:409});
   exchangeId=String(xs[0].id);
  }
  const result=await reconcileOrderLifecycle(userId,exchangeId,symbol);
  return NextResponse.json({ok:true,exchangeId,symbol: symbol||null,lifecycle:result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Lifecycle reconciliation failed'},{status:502});
 }
}
