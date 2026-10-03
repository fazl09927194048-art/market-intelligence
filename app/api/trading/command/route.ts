import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getSessionUserId} from '@/lib/exchange/session';
import {parseTradeIntent,resolveActiveTrades,createCommand} from '@/lib/trade-command-engine';

export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  const body=await req.json().catch(()=>({}));
  const text=String(body.text||body.command||'');
  const parsed=parseTradeIntent(text);
  if(parsed.intent==='UNKNOWN')return NextResponse.json({ok:false,parsed,trades:await resolveActiveTrades(userId)},{status:400});
  const symbol=body.symbol?String(body.symbol).toUpperCase():undefined;
  const trades=await resolveActiveTrades(userId,symbol);
  let tradeId=body.tradeId?String(body.tradeId):undefined;
  if(!tradeId&&trades.length===1)tradeId=String(trades[0].id);
  if(!tradeId&&trades.length!==1)return NextResponse.json({ok:false,parsed,requiresTradeSelection:true,trades},{status:409});
  const idempotencyKey=String(body.idempotencyKey||crypto.createHash('sha256').update(userId+'|'+(tradeId||'')+'|'+text).digest('hex'));
  const command=await createCommand(userId,tradeId,parsed.intent,{text,quantityPct:parsed.quantityPct||null},idempotencyKey);
  return NextResponse.json({ok:true,parsed,tradeId,command,execution:'NOT_EXECUTED',message:'Intent validated and recorded. Live execution requires the configured execution mode, risk checks, exchange verification and action-specific executor.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Trade command failed'},{status:502});}
}
