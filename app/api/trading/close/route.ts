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

  const baseAsset=symbol.replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
  if(!baseAsset||baseAsset===symbol) return NextResponse.json({ok:false,error:'Unsupported quote asset for automatic spot close.'},{status:400});
  const balances=await exchangeManager.balance(x.record.name,x.credentials);
  const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===baseAsset):null;
  const available=n(row?.free);
  if(available<=0) return NextResponse.json({ok:false,error:'No available spot balance to close for '+symbol+'.'},{status:409});
  const quantity=closeAll?available:Number(requestedQuantity);
  if(!Number.isFinite(quantity)||quantity<=0) return NextResponse.json({ok:false,error:'Close quantity must be positive.'},{status:400});
  if(quantity>available) return NextResponse.json({ok:false,error:'Requested close quantity exceeds the available free balance.'},{status:409});

  const intent={exchangeId,symbol,side:'SELL',type:'MARKET',quantity,reason:String(b.reason||'DRO user command'),closeAll};
  const mode=String(risk.execution_mode||'PAPER').toUpperCase();
  if(mode==='PAPER') return NextResponse.json({ok:true,mode:'PAPER',action:'CLOSE_POSITION',intent,simulated:true});
  if(mode==='CONFIRM') return NextResponse.json({ok:true,mode:'CONFIRM',action:'CLOSE_POSITION',requiresConfirmation:true,intent,message:'Close intent created. Explicit confirmation is required before live submission.'},{status:202});
  if(mode!=='AUTONOMOUS') return NextResponse.json({ok:false,error:'Invalid execution mode.'},{status:500});
  if(!risk.autonomous_enabled) return NextResponse.json({ok:false,error:'AUTONOMOUS mode is disabled in risk settings.'},{status:403});
  if(process.env.FLI_LIVE_TRADING_ENABLED!=='true') return NextResponse.json({ok:false,error:'Live execution is locked by the server.'},{status:403});

  await ensureExchangeSchema();
  const clientOrderId='FLI_CLOSE_'+crypto.randomBytes(12).toString('hex');
  const result=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol,side:'SELL',type:'MARKET',quantity:quantity.toString(),newOrderRespType:'FULL',clientOrderId});
  const status=String(result.status||'ACKNOWLEDGED').toUpperCase();
  const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[userId,exchangeId,symbol,'SELL','MARKET',quantity,Number(result.avgPrice||result.price)||null,clientOrderId,String(result.orderId||''),status,result]);
  await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',status,'CLOSE_SUBMITTED',result]);
  const tradeId=await createTradeForOrder({userId,exchangeId,orderId:inserted.rows[0].id,exchangeOrderId:String(result.orderId||''),clientOrderId,symbol,side:'SELL',executionMode:'AUTONOMOUS',quantity});
  await db().query("UPDATE trades SET state='CLOSING',closed_quantity=0,exit_reason=$1,updated_at=now() WHERE id=$2",[intent.reason,tradeId]);
  await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,'CREATED','CLOSING','CLOSE_SUBMITTED','DRO_TOOL',intent.reason,result]);
  let verification:any=null;
  try{verification=await exchangeManager.status(x.record.name,x.credentials,symbol,String(result.orderId||''),clientOrderId);await reconcileOrderLifecycle(userId,exchangeId,symbol);}catch{}
  await audit({userId,action:'CLOSE_POSITION',exchange:x.record.name,symbol,orderId:String(result.orderId||clientOrderId),source:'DRO_TOOL',result:'Position close submitted; verification attempted',status:status});
  return NextResponse.json({ok:true,mode:'AUTONOMOUS',action:'CLOSE_POSITION',symbol,side:'SELL',quantity,tradeId,order:result,verification,reason:intent.reason});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Close position failed'},{status:502})}
}