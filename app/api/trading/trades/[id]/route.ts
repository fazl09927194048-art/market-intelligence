import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {ensureExchangeSchema,db} from '@/lib/exchange/db';
export const dynamic='force-dynamic';
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const userId=await getSessionUserId(); const {id}=await params; await ensureExchangeSchema();
  const t=await db().query(`SELECT t.*,e.name AS exchange_name,e.environment,o.status AS order_status,o.raw AS order_raw FROM trades t LEFT JOIN exchanges e ON e.id=t.exchange_id LEFT JOIN orders o ON o.id=t.order_id WHERE t.id=$1 AND t.user_id=$2`,[id,userId]);
  if(!t.rows[0])return NextResponse.json({ok:false,error:'Trade not found.'},{status:404});
  const [events,protection,commands,alerts,outcome]=await Promise.all([
   db().query('SELECT * FROM trade_events WHERE trade_id=$1 ORDER BY created_at ASC',[id]),
   db().query('SELECT * FROM trade_protection WHERE trade_id=$1',[id]),
   db().query('SELECT * FROM trade_commands WHERE trade_id=$1 ORDER BY created_at DESC',[id]),
   db().query('SELECT * FROM trade_alerts WHERE trade_id=$1 ORDER BY created_at DESC',[id]),
   db().query('SELECT * FROM trade_outcomes WHERE trade_id=$1',[id])
  ]);
  return NextResponse.json({ok:true,trade:t.rows[0],events:events.rows,protection:protection.rows[0]||null,commands:commands.rows,alerts:alerts.rows,outcome:outcome.rows[0]||null},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Trade detail failed'},{status:502})}
}