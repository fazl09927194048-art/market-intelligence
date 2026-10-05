import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getSessionUserId} from '@/lib/exchange/session';
import {parseTradeIntent,resolveActiveTrades,createCommand,executeCloseCommand,executeStopAdjustmentCommand} from '@/lib/trade-command-engine';

export const dynamic='force-dynamic';

export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  const body=await req.json().catch(()=>({}));
  const text=String(body.text||body.command||'');
  const parsed=parseTradeIntent(text);
  if(parsed.intent==='UNKNOWN')return NextResponse.json({ok:false,parsed,trades:await resolveActiveTrades(userId)},{status:400});
  if(parsed.needsClarification)return NextResponse.json({ok:false,parsed,requiresClarification:true,message:'The command is ambiguous and no trade action was executed.'},{status:400});
  const symbol=body.symbol?String(body.symbol).toUpperCase():undefined;
  const trades=await resolveActiveTrades(userId,symbol);
  let tradeId=body.tradeId?String(body.tradeId):undefined;
  if(!tradeId&&trades.length===1)tradeId=String(trades[0].id);
  if(!tradeId&&trades.length!==1)return NextResponse.json({ok:false,parsed,requiresTradeSelection:true,trades},{status:409});
  const idempotencyKey=String(body.idempotencyKey||crypto.createHash('sha256').update(userId+'|'+(tradeId||'')+'|'+text).digest('hex'));
  if(parsed.intent==='CONDITIONAL_CLOSE'&&!parsed.conditionType) return NextResponse.json({ok:false,parsed,requiresClarification:true,message:'Specify an explicit profit/loss percentage for the conditional close.'},{status:400});
  const command=await createCommand(userId,tradeId,parsed.intent,{text,quantityPct:parsed.quantityPct||null,conditionType:parsed.conditionType||null,conditionValue:parsed.conditionValue||null},idempotencyKey);
  if(command.status!=='RECEIVED') return NextResponse.json({ok:true,parsed,tradeId,command,execution:'IDEMPOTENT_REPLAY',message:'This command was already processed; no duplicate exchange order was submitted.'},{headers:{'Cache-Control':'no-store'}});
  if(['CLOSE_POSITION','PARTIAL_CLOSE'].includes(parsed.intent)){
   const execution=await executeCloseCommand(userId,tradeId!,parsed.intent,Number(parsed.quantityPct||100));
   return NextResponse.json({ok:true,parsed,tradeId,command,execution},{headers:{'Cache-Control':'no-store'}});
  }
  if(parsed.intent==='MONITOR_ONLY'){
   await createCommand(userId,tradeId,parsed.intent,{text,mode:'MONITORING'},idempotencyKey+'-monitor');
   return NextResponse.json({ok:true,parsed,tradeId,command,execution:'MONITORING_ARMED',message:'Monitoring armed; no exchange order was submitted.'},{headers:{'Cache-Control':'no-store'}});
  }
  if(parsed.intent==='CONDITIONAL_CLOSE'){
   return NextResponse.json({ok:true,parsed,tradeId,command,execution:'CONDITION_ARMED',message:'Conditional close recorded. Reconciliation will evaluate the explicit threshold before any close action.'},{headers:{'Cache-Control':'no-store'}});
  }
  if(['MOVE_STOP_TO_BREAKEVEN','TIGHTEN_STOP'].includes(parsed.intent)){
   const requestedStop=body.stopPrice===undefined?undefined:Number(body.stopPrice);
   const execution=await executeStopAdjustmentCommand(userId,tradeId!,parsed.intent as any,requestedStop);
   return NextResponse.json({ok:true,parsed,tradeId,command,execution},{headers:{'Cache-Control':'no-store'}});
  }
  await createCommand(userId,tradeId,parsed.intent,{text,quantityPct:parsed.quantityPct||null,execution:'PENDING_ACTION_EXECUTOR'},idempotencyKey+'-pending');
  return NextResponse.json({ok:true,parsed,tradeId,command,execution:'PENDING_ACTION_EXECUTOR',message:'Intent is validated and recorded; this action requires its dedicated protection/monitoring executor.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Trade command failed'},{status:502});}
}
