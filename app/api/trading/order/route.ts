function modeWillBeAutonomous(requested:unknown,risk:any){return String(risk.execution_mode||requested||'PAPER').toUpperCase()==='AUTONOMOUS'}
import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getSessionUserId} from '@/lib/exchange/session';
import {getExchange,ensureExchangeSchema,db,audit,getTradingRisk} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';
import {runIntelligenceCycle} from '@/lib/intelligence-loop';
import {createTradeForOrder} from '@/lib/trade-lifecycle';
import {calculateDynamicRisk} from '@/lib/dynamic-risk-engine';
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
  // DRO autonomous execution must be backed by a fresh intelligence cycle, not a raw signal.
  let droGuard:any=null; let intelligence:any=null;
  if(modeWillBeAutonomous(b.executionMode, risk)) {
   const cycle=await runIntelligenceCycle(symbol, String(b.interval||'15m')); intelligence=cycle;
   const plan=cycle.tradePlan;
   const requestedSide=side==='BUY'?'LONG':'SHORT';
   const confidence=Number(plan?.confidence||0);
   const rr=Number(plan?.riskReward||0);
   const entry=Number(plan?.entry);
   const stop=Number(plan?.stopLoss);
   const tp=Number(plan?.takeProfit);
   const validNumbers=[entry,stop,tp].every(Number.isFinite);
   const sideMatch=String(plan?.side||'NO TRADE')===requestedSide;
   const fresh=Date.now()-new Date(String(cycle.generatedAt||'')).getTime()<=120000;
   const minConfidence=65;
   const minRR=1.5;
   if(!fresh||!cycle.dataValid||plan?.status!=='SIGNAL'||!plan?.invalidation||!sideMatch||!validNumbers||confidence<minConfidence||rr<minRR) {
    return NextResponse.json({ok:false,error:'DRO TRADE GUARD BLOCKED THE ORDER: fresh multi-factor confirmation, valid SL/TP, direction match, data validity, confidence and risk/reward requirements were not satisfied.',droGuard:{status:'BLOCKED',confidence,requiredConfidence:minConfidence,riskReward:rr,requiredRiskReward:minRR,sideMatch,validNumbers,fresh,dataValid:Boolean(cycle.dataValid),planStatus:plan?.status||'UNKNOWN'}},{status:409});
   }
   const stopDistance=Math.abs(entry-stop);
   const estimatedQty=quantity??(quoteQuantity!/entry);
   const estimatedRisk=estimatedQty*stopDistance;
   if(!Number.isFinite(estimatedRisk)||estimatedRisk<=0||estimatedRisk>Number(risk.max_daily_loss_usd)) {
    return NextResponse.json({ok:false,error:'DRO TRADE GUARD BLOCKED THE ORDER: estimated stop-loss risk exceeds the configured daily loss limit.',droGuard:{status:'BLOCKED',estimatedRisk,maxDailyLoss:Number(risk.max_daily_loss_usd)}},{status:403});
   }
   droGuard={status:'PASSED',cycleId:cycle.cycleId,confidence,riskReward:rr,entry,stopLoss:stop,takeProfit:tp,estimatedRisk,requiredConfidence:minConfidence,requiredRiskReward:minRR};
  }
  if(risk.emergency_stop) return NextResponse.json({ok:false,error:'Emergency stop is active.'},{status:423});
  const mode=String(risk.execution_mode||'PAPER').toUpperCase();
  if(!['PAPER','CONFIRM','AUTONOMOUS'].includes(mode)) return NextResponse.json({ok:false,error:'Invalid execution mode.'},{status:500});
  if(Array.isArray(risk.allowed_symbols)&&risk.allowed_symbols.length&&!risk.allowed_symbols.includes(symbol)) return NextResponse.json({ok:false,error:'Symbol is blocked by the active risk policy.'},{status:403});
  const x=await getExchange(userId,exchangeId);
  if(Array.isArray(risk.allowed_exchanges)&&risk.allowed_exchanges.length&&!risk.allowed_exchanges.includes(x.record.name)) return NextResponse.json({ok:false,error:'Exchange is blocked by the active risk policy.'},{status:403});
  let effectivePrice=price;
  if(droGuard?.entry && type==='MARKET') effectivePrice=Number(droGuard.entry);
  const notional=quoteQuantity??(quantity!==undefined?(effectivePrice??0)*quantity:0);
  if(!Number.isFinite(notional)||notional<=0) return NextResponse.json({ok:false,error:'Unable to determine order notional. Provide price for LIMIT orders.'},{status:400});
  if(notional>Number(risk.max_order_usd)) return NextResponse.json({ok:false,error:'Order exceeds max_order_usd ('+risk.max_order_usd+').'},{status:403});
  if(droGuard && notional>Number(risk.max_position_usd)) return NextResponse.json({ok:false,error:'DRO execution blocked: requested position exceeds max_position_usd ('+risk.max_position_usd+').'},{status:403});
  if(droGuard && type==='LIMIT' && price!==undefined){const deviation=Math.abs(price-Number(droGuard.entry))/Number(droGuard.entry)*100;if(!Number.isFinite(deviation)||deviation>0.5)return NextResponse.json({ok:false,error:'DRO execution blocked: limit price is more than 0.5% away from the approved entry.'},{status:409});}
  await ensureExchangeSchema();
  let dynamicRisk:any=null;
  if(droGuard){
   const realized=await db().query("SELECT COALESCE(SUM(CASE WHEN realized_pnl<0 THEN -realized_pnl ELSE 0 END),0)::numeric AS loss FROM trades WHERE user_id=$1 AND closed_at>=CURRENT_DATE",[userId]);
   const exposure=await db().query("SELECT COALESCE(SUM(COALESCE(current_notional,0)),0)::numeric AS exposure FROM trades WHERE user_id=$1 AND state NOT IN ('CLOSED','REJECTED','CANCELED','CANCELLED','EXPIRED','FAILED')",[userId]);
   dynamicRisk=calculateDynamicRisk({risk,advanced:intelligence.marketData,technical:intelligence.technical,side,entry:Number(droGuard.entry),stop:Number(droGuard.stopLoss),takeProfit:Number(droGuard.takeProfit),confidence:Number(droGuard.confidence),dailyRealizedLoss:Number(realized.rows[0]?.loss||0),openExposure:Number(exposure.rows[0]?.exposure||0)});
   const requestedQty=quantity??(quoteQuantity!/Number(droGuard.entry));
   if(!dynamicRisk.allowed) return NextResponse.json({ok:false,error:'DRO dynamic risk engine blocked the order.',dynamicRisk},{status:403});
   if(!Number.isFinite(requestedQty)||requestedQty<=0||requestedQty>Number(dynamicRisk.recommendedQuantity)) return NextResponse.json({ok:false,error:'DRO dynamic risk engine blocked the order: requested size exceeds the context-aware risk budget.',requestedQuantity:requestedQty,recommendedQuantity:dynamicRisk.recommendedQuantity,dynamicRisk},{status:403});
  }
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
  if(!droGuard) return NextResponse.json({ok:false,error:'DRO execution guard is required for autonomous orders.'},{status:409});
  const result=await exchangeManager.createOrder(x.record.name,x.credentials,p);
  const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,quote_quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",[userId,exchangeId,symbol,side,type,quantity??null,quoteQuantity??null,price??null,clientOrderId,String(result.orderId||''),String(result.status||'ACKNOWLEDGED'),result]);
  await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',String(result.status||'ACKNOWLEDGED'),'EXCHANGE_SUBMITTED',result]);
  const tradeId=await createTradeForOrder({userId,exchangeId,orderId:inserted.rows[0].id,exchangeOrderId:String(result.orderId||''),clientOrderId,symbol,side,executionMode:mode,cycleId:droGuard?.cycleId,plannedEntry:droGuard?.entry,quantity:quantity??(quoteQuantity&&droGuard?.entry?quoteQuantity/Number(droGuard.entry):undefined),stopPrice:droGuard?.stopLoss,takeProfitPrice:droGuard?.takeProfit});
  const remoteStatus=String(result.status||'ACKNOWLEDGED').toUpperCase();
  const initialTradeState=remoteStatus==='FILLED'?'FILLED':remoteStatus==='PARTIALLY_FILLED'?'PARTIALLY_FILLED':'ACKNOWLEDGED';
  await db().query("UPDATE trades SET state=$1,submitted_at=now(),updated_at=now() WHERE id=$2",[initialTradeState,tradeId]);
  await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,'CREATED',initialTradeState,'ORDER_SUBMITTED','DRO_TOOL','Autonomous order accepted by exchange',result]);
  await audit({userId,action:'CREATE_ORDER',exchange:x.record.name,symbol,orderId:String(result.orderId||clientOrderId),source:'DRO_TOOL',result:'Submitted and linked to trade lifecycle',status:remoteStatus});
  return NextResponse.json({ok:true,mode:'AUTONOMOUS',order:result,clientOrderId,tradeId,droGuard,dynamicRisk});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Order failed'},{status:502})}
}