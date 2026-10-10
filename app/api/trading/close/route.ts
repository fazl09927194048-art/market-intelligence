import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getSessionUserId} from '@/lib/exchange/session';
import {getExchange,getTradingRisk,audit,listExchanges} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';
import {ensureExchangeSchema,db} from '@/lib/exchange/db';
import {createTradeForOrder,reconcileOrderLifecycle} from '@/lib/trade-lifecycle';

export const dynamic='force-dynamic';

function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0}

export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  const b=await req.json();
  let exchangeId=String(b.exchangeId||'');
  const symbol=String(b.symbol||'').toUpperCase();
  const requestedQuantity=b.quantity===undefined?undefined:Number(b.quantity);
  const closeAll=b.closeAll===true;
  if(!/^[A-Z0-9]{2,20}$/.test(symbol)) return NextResponse.json({ok:false,error:'symbol is required.'},{status:400});
  if(!closeAll && (requestedQuantity===undefined || !Number.isFinite(requestedQuantity) || requestedQuantity<=0)) {
   return NextResponse.json({ok:false,error:'Provide a positive quantity to close, or set closeAll=true explicitly to close the entire available spot balance.'},{status:400});
  }
  const risk=await getTradingRisk(userId);
  if(risk.emergency_stop) return NextResponse.json({ok:false,error:'Emergency stop is active.'},{status:423});
  if(!exchangeId){
   const xs=await listExchanges(userId);
   if(xs.length!==1) return NextResponse.json({ok:false,error:'Select the exchange to close; multiple exchanges are connected.'},{status:409});
   exchangeId=String(xs[0].id);
  }
  const x=await getExchange(userId,exchangeId);
  if(x.record.name!=='binance') return NextResponse.json({ok:false,error:'Close-position execution is currently implemented for Binance.'},{status:501});
  if(!x.record.permissions?.trading) return NextResponse.json({ok:false,error:'Trading permission is disabled on this API key.'},{status:403});

  const accountType=String(x.record.account_type||'SPOT').toUpperCase();
  let available=0;
  let orderSide:'BUY'|'SELL'='SELL';
  if(accountType==='FUTURES') {
    const result=await exchangeManager.positions(x.record.name,x.credentials);
    const positions=Array.isArray(result?.positions)?result.positions:[];
    const matching=positions.filter((v:any)=>String(v?.symbol||'').toUpperCase()===symbol&&Math.abs(n(v?.positionAmt))>0);
    if(matching.length>1) return NextResponse.json({ok:false,error:'Multiple open Futures positions exist for this symbol (likely Hedge mode). Automatic close is blocked because positionSide-aware closing is not yet supported.'},{status:409});
    const position=matching[0];
    const amount=n(position?.positionAmt);
    available=Math.abs(amount);
    if(amount<0) orderSide='BUY';
    if(available<=0) return NextResponse.json({ok:false,error:'No open Futures position exists for '+symbol+'.'},{status:409});
  } else {
    const baseAsset=symbol.replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
    if(!baseAsset||baseAsset===symbol) return NextResponse.json({ok:false,error:'Unsupported quote asset for automatic spot close.'},{status:400});
    const balances=await exchangeManager.balance(x.record.name,x.credentials);
    const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===baseAsset):null;
    available=n(row?.free);
    if(available<=0) return NextResponse.json({ok:false,error:'No available spot balance to close for '+symbol+'.'},{status:409});
  }
  const quantity=closeAll?available:Number(requestedQuantity);
  if(!Number.isFinite(quantity)||quantity<=0) return NextResponse.json({ok:false,error:'Close quantity must be positive.'},{status:400});
  if(quantity>available) return NextResponse.json({ok:false,error:'Requested close quantity exceeds the available balance or position.'},{status:409});
  const intent={exchangeId,symbol,side:orderSide,type:'MARKET',quantity,reason:String(b.reason||'DRO user command'),closeAll};
  const mode=String(risk.execution_mode||'PAPER').toUpperCase();
  if(mode==='PAPER') return NextResponse.json({ok:true,mode:'PAPER',action:'CLOSE_POSITION',intent,simulated:true});
  if(mode==='CONFIRM') return NextResponse.json({ok:true,mode:'CONFIRM',action:'CLOSE_POSITION',requiresConfirmation:true,intent,message:'Close intent created. Explicit confirmation is required before live submission.'},{status:202});
  if(mode!=='AUTONOMOUS') return NextResponse.json({ok:false,error:'Invalid execution mode.'},{status:500});
  if(!risk.autonomous_enabled) return NextResponse.json({ok:false,error:'AUTONOMOUS mode is disabled in risk settings.'},{status:403});
  if(process.env.FLI_LIVE_TRADING_ENABLED!=='true') return NextResponse.json({ok:false,error:'Live execution is locked by the server.'},{status:403});

  await ensureExchangeSchema();
  const clientOrderId='FLI_CLOSE_'+crypto.randomBytes(12).toString('hex');
  const result=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol,side:orderSide,type:'MARKET',quantity:quantity.toString(),...(accountType==='FUTURES'?{reduceOnly:true}:{}),newOrderRespType:'FULL',clientOrderId});
  const status=String(result.status||'ACKNOWLEDGED').toUpperCase();
  const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[userId,exchangeId,symbol,orderSide,'MARKET',quantity,Number(result.avgPrice||result.price)||null,clientOrderId,String(result.orderId||''),status,result]);
  await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',status,'CLOSE_SUBMITTED',result]);
  const parentSide=accountType==='FUTURES'?(orderSide==='BUY'?'SELL':'BUY'):'BUY';
  const parentResult=await db().query("SELECT id,state FROM trades WHERE user_id=$1 AND exchange_id=$2 AND symbol=$3 AND side=$4 AND state NOT IN ('CLOSED','REJECTED','CANCELED','CANCELLED','EXPIRED','FAILED','EMERGENCY_CLOSED') ORDER BY created_at DESC LIMIT 1",[userId,exchangeId,symbol,parentSide]);
  const parentTradeId=parentResult.rows[0]?.id?String(parentResult.rows[0].id):undefined;
  const tradeId=await createTradeForOrder({userId,exchangeId,orderId:inserted.rows[0].id,exchangeOrderId:String(result.orderId||''),clientOrderId,symbol,side:orderSide,executionMode:'AUTONOMOUS',quantity,parentTradeId});
  await db().query("UPDATE trades SET state='CLOSING',closed_quantity=0,exit_reason=$1,updated_at=now() WHERE id=$2",[intent.reason,tradeId]);
  await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,'CREATED','CLOSING','CLOSE_SUBMITTED','DRO_TOOL',intent.reason,result]);
  let verification:any=null;
  try{verification=await exchangeManager.status(x.record.name,x.credentials,symbol,String(result.orderId||''),clientOrderId);await reconcileOrderLifecycle(userId,exchangeId,symbol);}catch{}
  await audit({userId,action:'CLOSE_POSITION',exchange:x.record.name,symbol,orderId:String(result.orderId||clientOrderId),source:'DRO_TOOL',result:'Position close submitted; verification attempted',status:status});
  return NextResponse.json({ok:true,mode:'AUTONOMOUS',action:'CLOSE_POSITION',symbol,side:orderSide,quantity,tradeId,order:result,verification,reason:intent.reason});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Close position failed'},{status:502})}
}