import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {executeProtectionCommand} from '@/lib/trade-command-engine';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId(); const b=await req.json().catch(()=>({}));
  const tradeId=String(b.tradeId||''); const stop=Number(b.stopPrice); const tp=Number(b.takeProfitPrice);
  if(!tradeId||!Number.isFinite(stop)||!Number.isFinite(tp)) return NextResponse.json({ok:false,error:'tradeId, stopPrice and takeProfitPrice are required.'},{status:400});
  const result=await executeProtectionCommand(userId,tradeId,stop,tp);
  return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Protection setup failed'},{status:502})}
}