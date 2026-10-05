import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {executeCloseCommand} from '@/lib/trade-command-engine';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId(); const b=await req.json().catch(()=>({}));
  const tradeId=String(b.tradeId||''); const pct=Number(b.quantityPct);
  if(!tradeId||!Number.isFinite(pct)||pct<=0||pct>=100) return NextResponse.json({ok:false,error:'tradeId and quantityPct between 0 and 100 are required.'},{status:400});
  const result=await executeCloseCommand(userId,tradeId,'PARTIAL_CLOSE',pct);
  return NextResponse.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Partial close failed'},{status:502})}
}