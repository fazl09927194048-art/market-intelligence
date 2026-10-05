import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {ensureExchangeSchema,db} from '@/lib/exchange/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const userId=await getSessionUserId(); await ensureExchangeSchema();
  const p=req.nextUrl.searchParams, state=p.get('state'), symbol=p.get('symbol')?.toUpperCase(), limit=Math.min(100,Math.max(1,Number(p.get('limit')||50)));
  const args:any[]=[userId]; let where='t.user_id=$1';
  if(state){args.push(state.toUpperCase());where+=` AND t.state=$${args.length}`;}
  if(symbol){args.push(symbol);where+=` AND t.symbol=$${args.length}`;}
  args.push(limit);
  const r=await db().query(`SELECT t.*,e.name AS exchange_name,e.environment,o.status AS order_status FROM trades t LEFT JOIN exchanges e ON e.id=t.exchange_id LEFT JOIN orders o ON o.id=t.order_id WHERE ${where} ORDER BY t.created_at DESC LIMIT $${args.length}`,args);
  return NextResponse.json({ok:true,trades:r.rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Trade list failed'},{status:502})}
}