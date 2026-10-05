import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {ensureExchangeSchema,db} from '@/lib/exchange/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const userId=await getSessionUserId(); await ensureExchangeSchema();
  const limit=Math.min(100,Math.max(1,Number(req.nextUrl.searchParams.get('limit')||50)));
  const r=await db().query("SELECT * FROM trade_alerts WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",[userId,limit]);
  return NextResponse.json({ok:true,alerts:r.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Alerts query failed'},{status:502})}
}