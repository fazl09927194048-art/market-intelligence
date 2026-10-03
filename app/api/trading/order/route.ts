import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getSessionUserId} from '@/lib/exchange/session';
import {getExchange,ensureExchangeSchema,db,audit,getTradingRisk} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';
export const dynamic='force-dynamic';
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:undefined}
export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId(); const b=await req.json();
  const exchangeId=String(b.exchangeId||''), symbol=String(b.symbol||'').toUpperCase(), side=String(b.side||'').toUpperCase(), type=String(b.type||'MARKET').toUpperCase();
  const quantity=num(b.quantity), quoteQuantity=num(b.quoteOrderQty), price=num(b.price);
  if(!exchangeId||!/^[A-Z0-9]{2,20}$/.test(symbol)||!['BUY','SELL'].includes(side)||!['MARKET','LIMIT'].includes(type)) return NextResponse.json({ok:false,error:'Invalid order parameters.'},{status:400});
  if((quantity===undefined||quantity<=0)&&(quoteQuantity===undefined||quoteQuantity<=0)) return NextResponse.json({ok:false,error:'A positive quantity or quoteOrderQty is required.'},{status:400});
  if(type==='LIMIT'&&(price===undefined||price<=0)) return NextResponse.json({ok:false,error:'A valid limit price is required.'},{status:400});
  const risk=await getTradingRisk(userId);
  if(risk.emergency_stop) return NextResponse.json({ok:false,error:'Emergency stop is active.'},{status:423});
  const mode=String(risk.execution_mode||'PAPER').toUpperCase();
  if(!['PAPER','CONFIRM','AUTONOMOUS'].includes(mode)) return NextResponse.json({ok:false,error:'Invalid execution mode.'},{status:500});
  if(Array.isArray(risk.allowed_symbols)&&risk.allowed_symbols.length&&!risk.allowed_symbols.includes(symbol)) return NextResponse.json({ok:false,error:'Symbol is blocked by the active risk policy.'},{status:403});
  const x=await getExchange(userId,exchangeId);
  if(Array.isArray(risk.allowed_exchanges)&&risk.allowed_exchanges.length&&!risk.allowed_exchanges.includes(x.record.name)) return NextResponse.json({ok:false,error:'Exchange is blocked by the active risk policy.'},{status:403});
  const notional=quoteQuantity??(quantity!==undefined?(price??0)*quantity:0);
  if(!Number.isFinite(notional)||notional<=0) return NextResponse.json({ok:false,error:'Unable to determine order notional. Provide price for LIMIT orders.'},{status:400});
  if(notional>Number(risk.max_order_usd)) return NextResponse.json({ok:false,error:'Order exceeds max_order_usd ('+risk.max_order_usd+').'},{status:403});
  await ensureExchangeSchema();
  const count=await db().query("SELECT COUNT(*)::int AS n FROM orders WHERE user_id=$1 AND created_at>=CURRENT_DATE",[userId]);
  if(Number(count.rows[0]?.n||0)>=Number(risk.max_trades)) return NextResponse.json({ok:false,error:'Daily trade limit reached ('+risk.max_trades+').'},{status:403});
  const clientOrderId='FLI_'+crypto.randomBytes(12).toString('hex'); const p:any={symbol,side,type,clientOrderId};
  if(quantity!==undefined)p.quantity=quantity; if(quoteQuantity!==undefined)p.quoteOrderQty=quoteQuantity;
  if(type==='LIMIT'){p.timeInForce='GTC';p.price=price;}
  if(mode==='PAPER'){
   const simulated={orderId:'PAPER_'+clientOrderId,clientOrderId,status:'FILLED',symbol,side,type,quantity:quantity??null,quoteOrderQty:quoteQuantity??null,price:price??null,simulated:true};
   const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,quote_quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",[userId,exchangeId,symbol,side,type,quantity??null,quoteQuantity??null,price??null,clientOrderId,simulated.orderId,'FILLED',simulated]);
   await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED','FILLED','PAPER_EXECUTION',simulated]);
   await audit({userId,action:'CREATE_ORDER',exchange:x.record.name,symbol,source:'PAPER_ENGINE',result:'Simulated',status:'FILLED'});
   return NextResponse.json({ok:true,mode:'PAPER',order:simulated,clientOrderId});
  }
  if(mode==='CONFIRM') return NextResponse.json({ok:true,mode:'CONFIRM',requiresConfirmation:true,intent:{exchangeId,symbol,side,type,quantity:quantity??null,quoteOrderQty:quoteQuantity??null,price:price??null,clientOrderId},message:'Order intent created. Explicit confirmation is required before live submission.'},{status:202});
  if(!risk.autonomous_enabled) return NextResponse.json({ok:false,error:'AUTONOMOUS mode is disabled in risk settings.'},{status:403});
  if(process.env.FLI_LIVE_TRADING_ENABLED!=='true') return NextResponse.json({ok:false,error:'Live execution is locked by the server.'},{status:403});
  if(!x.record.permissions?.trading) return NextResponse.json({ok:false,error:'Trading permission is disabled on this API key.'},{status:403});
  const result=await exchangeManager.createOrder(x.record.name,x.credentials,p);
  const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,quote_quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",[userId,exchangeId,symbol,side,type,quantity??null,quoteQuantity??null,price??null,clientOrderId,String(result.orderId||''),String(result.status||'ACKNOWLEDGED'),result]);
  await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',String(result.status||'ACKNOWLEDGED'),'EXCHANGE_SUBMITTED',result]);
  await audit({userId,action:'CREATE_ORDER',exchange:x.record.name,symbol,source:'DRO_TOOL',result:'Submitted',status:String(result.status||'ACKNOWLEDGED')});
  return NextResponse.json({ok:true,mode:'AUTONOMOUS',order:result,clientOrderId});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Order failed'},{status:502})}
}