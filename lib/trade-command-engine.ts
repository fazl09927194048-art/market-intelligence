import crypto from 'node:crypto';
import {db,ensureExchangeSchema,getExchange,getTradingRisk,audit} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';
import {createTradeForOrder,reconcileOrderLifecycle} from '@/lib/trade-lifecycle';

export type TradeIntent='CLOSE_POSITION'|'PARTIAL_CLOSE'|'MOVE_STOP_TO_BREAKEVEN'|'TIGHTEN_STOP'|'MONITOR_ONLY'|'CONDITIONAL_CLOSE'|'UNKNOWN';
function openPositionQuantity(trade:any){
 const filled=Number(trade?.filled_quantity);
 const closed=Number(trade?.closed_quantity);
 const original=Number(trade?.original_quantity);
 const state=String(trade?.state||'').toUpperCase();
 if(Number.isFinite(filled)&&filled>0) return Math.max(0,filled-(Number.isFinite(closed)?Math.max(0,closed):0));
 if(['FILLED','PROTECTED','MONITORING','ADJUSTING','CLOSING'].includes(state)&&Number.isFinite(original)&&original>0) return original;
 return 0;
}

export function parseTradeIntent(input:string){
 const text=String(input||'').trim().toLowerCase();
 if(!text)return {intent:'UNKNOWN' as TradeIntent,confidence:0,needsClarification:true,reason:'Empty command.'};
 if(/نصف|half|50\s*%/.test(text)&&/(ببند|بستن|close|ببندش)/.test(text))return {intent:'PARTIAL_CLOSE' as TradeIntent,quantityPct:50,confidence:.98,needsClarification:false};
 if(/سر.?استاپ|استاپ.*ورود|break.?even|breakeven/.test(text))return {intent:'MOVE_STOP_TO_BREAKEVEN' as TradeIntent,confidence:.95,needsClarification:false};
 if(/استاپ.*نزدیک|tighten.*stop/.test(text))return {intent:'TIGHTEN_STOP' as TradeIntent,confidence:.92,needsClarification:false};
 if(/فقط.*مانیتور|مانیتور.*کن|دست نزن|monitor only/.test(text))return {intent:'MONITOR_ONLY' as TradeIntent,confidence:.95,needsClarification:false};
 if(/اگر|در صورت|conditional/.test(text)&&/(ضرر|loss|سود|profit).*(\d+(?:\.\d+)?)\s*%/.test(text)){const m=text.match(/(ضرر|loss|سود|profit).*?(\d+(?:\.\d+)?)\s*%/); const kind=/سود|profit/.test(text)?'PROFIT_PCT':'LOSS_PCT'; return {intent:'CONDITIONAL_CLOSE' as TradeIntent,conditionType:kind,conditionValue:Number(m?.[2]),confidence:.92,needsClarification:false};}
 if(/ببند|بستن|بسته.*کن|close|exit/.test(text))return {intent:'CLOSE_POSITION' as TradeIntent,confidence:.97,needsClarification:false};
 return {intent:'UNKNOWN' as TradeIntent,confidence:.2,needsClarification:true,reason:'No safe trading intent matched.'};
}

export async function resolveActiveTrades(userId:string,symbol?:string){
 await ensureExchangeSchema();
 const params:any[]=[userId];
 let where='user_id=$1 AND state NOT IN (\'CLOSED\',\'REJECTED\',\'CANCELED\',\'CANCELLED\',\'EXPIRED\',\'FAILED\')';
 if(symbol){params.push(symbol.toUpperCase());where+=' AND symbol=$2';}
 const r=await db().query(`SELECT id,symbol,side,state,average_fill_price,current_price,unrealized_pnl,unrealized_pnl_pct,stop_price,take_profit_price,risk_level,thesis_status,created_at,updated_at FROM trades WHERE ${where} ORDER BY created_at DESC LIMIT 20`,params);
 return r.rows;
}

export async function createCommand(userId:string,tradeId:string|undefined,intent:TradeIntent,payload:any,idempotencyKey:string){
 await ensureExchangeSchema();
 const r=await db().query(`INSERT INTO trade_commands(trade_id,user_id,intent,payload,status,idempotency_key) VALUES($1,$2,$3,$4,CASE WHEN $3 IN ('CONDITIONAL_CLOSE','MONITOR_ONLY') THEN 'ARMED' ELSE 'RECEIVED' END,$5) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET updated_at=now() RETURNING id,status,trade_id,intent,payload,idempotency_key`,[tradeId||null,userId,intent,payload,idempotencyKey]);
 return r.rows[0];
}


export async function executeProtectionCommand(userId:string,tradeId:string,stopPrice:number,takeProfitPrice:number){
 await ensureExchangeSchema();
 if(!Number.isFinite(stopPrice)||stopPrice<=0||!Number.isFinite(takeProfitPrice)||takeProfitPrice<=0) throw new Error('Valid stop-loss and take-profit prices are required.');
 const t=await db().query("SELECT * FROM trades WHERE id=$1 AND user_id=$2 LIMIT 1",[tradeId,userId]);
 if(!t.rows[0]) throw new Error('Trade not found.');
 const trade=t.rows[0]; const risk=await getTradingRisk(userId);
 if(risk.emergency_stop) throw new Error('Emergency stop is active.');
 const x=await getExchange(userId,String(trade.exchange_id));
 if(String(x.record.name).toLowerCase()!=='binance') throw new Error('Protection execution currently supports Binance.');
 if(!x.record.permissions?.trading) throw new Error('Trading permission is disabled on this API key.');
 const accountType=String(x.record.account_type||'SPOT').toUpperCase();
 const tradeSide=String(trade.side||'').toUpperCase();
 const isLong=tradeSide==='BUY';
 if(accountType==='SPOT'&&!isLong) throw new Error('Spot protection only supports a long BUY holding.');
 if(accountType==='FUTURES'&&!['BUY','SELL'].includes(tradeSide)) throw new Error('Unsupported Futures position direction.');
 const entry=Number(trade.average_fill_price??trade.submitted_price??trade.planned_entry);
 if(!entry||entry<=0) throw new Error('A verified entry price is required before protection can be placed.');
 if(isLong ? !(stopPrice<entry&&takeProfitPrice>entry) : !(stopPrice>entry&&takeProfitPrice<entry)) {
   throw new Error('Invalid protection direction: long positions need SL below entry and TP above entry; short positions need SL above entry and TP below entry.');
 }
 let current=0;
 try{const ticker=await exchangeManager.ticker(x.record.name,x.credentials,String(trade.symbol));current=Number(ticker?.lastPrice??ticker?.price);}catch{throw new Error('Could not fetch a live exchange price; protection was not submitted.');}
 if(!Number.isFinite(current)||current<=0) throw new Error('A valid live exchange price is required before placing protection.');
 if(isLong ? !(stopPrice<current&&takeProfitPrice>current) : !(stopPrice>current&&takeProfitPrice<current)) {
   throw new Error('Protection prices are on the wrong side of the current market and could trigger immediately; refresh the price and set valid SL/TP levels.');
 }
 const qty=openPositionQuantity(trade);
 if(!Number.isFinite(qty)||qty<=0) throw new Error('No protected position quantity is available.');
 if(accountType==='FUTURES'){
  const positionResult=await exchangeManager.positions(x.record.name,x.credentials);
  const matching=(Array.isArray(positionResult?.positions)?positionResult.positions:[]).filter((v:any)=>String(v?.symbol||'').toUpperCase()===String(trade.symbol).toUpperCase()&&Math.abs(Number(v?.positionAmt)||0)>0);
  if(matching.length!==1||String(matching[0]?.positionSide||'BOTH').toUpperCase()!=='BOTH') throw new Error('Futures protection currently requires exactly one One-way position for this symbol; Hedge mode or ambiguous positions are blocked.');
  const amount=Number(matching[0]?.positionAmt);
  if(!Number.isFinite(amount)||amount===0||(amount<0)!==(!isLong)) throw new Error('Exchange position direction does not match this trade record; reconciliation is required.');
  const actualQty=Math.abs(amount);
  if(Math.abs(actualQty-qty)>Math.max(1e-10,actualQty*1e-6)) throw new Error('Exchange position size differs from the trade record; protection is blocked until quantities are reconciled.');
 }
 const exitSide=isLong?'SELL':'BUY';
 const reduceOnly=accountType==='FUTURES'?{reduceOnly:true}:{};
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 const payload={tradeId,symbol:trade.symbol,accountType,positionSide:isLong?'LONG':'SHORT',quantity:qty,stopPrice,takeProfitPrice};
 if(mode==='PAPER') return {mode,simulated:true,verified:true,payload};
 if(mode==='CONFIRM') return {mode,requiresConfirmation:true,verified:false,payload};
 if(mode!=='AUTONOMOUS'||!risk.autonomous_enabled||process.env.FLI_LIVE_TRADING_ENABLED!=='true') throw new Error('Live protection is not enabled by the current execution policy.');
 const existingProtection=await db().query("SELECT status,stop_order_id,take_profit_order_id FROM trade_protection WHERE trade_id=$1 LIMIT 1",[tradeId]);
 const protectionState=String(existingProtection.rows[0]?.status||'').toUpperCase();
 if(['PROTECTED','RECONCILIATION_REQUIRED','PROTECTION_PENDING'].includes(protectionState)) throw new Error('Existing protection is already recorded or unresolved. Reconcile/cancel existing exchange orders before submitting new protection to avoid duplicate exit orders.');
 const stopClient='FLI_SL_'+crypto.randomBytes(10).toString('hex'), tpClient='FLI_TP_'+crypto.randomBytes(10).toString('hex');
 let stop:any;
 try{stop=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:exitSide,...reduceOnly,type:'STOP_LOSS_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(stopPrice),stopPrice:String(stopPrice),newOrderRespType:'FULL',clientOrderId:stopClient});}
 catch(firstError){
  try{stop=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,undefined,stopClient);}
  catch{
   await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,status,raw) VALUES($1,$2,$3,$4,'STOP_LOSS_LIMIT',$5,$6,$7,'RECONCILIATION_REQUIRED',$8) ON CONFLICT(exchange_id,client_order_id) DO UPDATE SET status='RECONCILIATION_REQUIRED',raw=EXCLUDED.raw,updated_at=now()",[userId,trade.exchange_id,trade.symbol,exitSide,qty,stopPrice,stopClient,{error:firstError instanceof Error?firstError.message:'Submission outcome unknown'}]);
   await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,updated_at) VALUES($1,NULL,NULL,$2,$3,'RECONCILIATION_REQUIRED',now()) ON CONFLICT(trade_id) DO UPDATE SET status='RECONCILIATION_REQUIRED',updated_at=now()",[tradeId,stopPrice,takeProfitPrice]);
   await db().query("UPDATE trades SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE id=$1",[tradeId]);
   await audit({userId,action:'PROTECTION_RECONCILIATION_REQUIRED',exchange:x.record.name,symbol:trade.symbol,orderId:stopClient,source:'DRO_TOOL',result:'Stop submission outcome is unknown; exchange lookup failed.',status:'RECONCILIATION_REQUIRED'});
   throw new Error('Stop-loss submission outcome is unknown because the exchange could not confirm it. The trade is marked for reconciliation; do not retry protection blindly.');
  }
 }
 let tp:any=null;
 try{tp=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:exitSide,...reduceOnly,type:'TAKE_PROFIT_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(takeProfitPrice),stopPrice:String(takeProfitPrice),newOrderRespType:'FULL',clientOrderId:tpClient});}
 catch(firstError){
  try{tp=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,undefined,tpClient);}
  catch{
   let stopCancelled=false, tpCancelled=false;
   try{
    const tpCancel=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,undefined,tpClient);
    tpCancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(tpCancel?.status||'').toUpperCase());
   }catch{}
   if(!tpCancelled){try{const tpVerify=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,undefined,tpClient);tpCancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(tpVerify?.status||tpVerify?.orderStatus||'').toUpperCase());}catch{}}
   try{
    if(stop?.orderId){
     const cancelled=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(stop.orderId),stopClient);
     stopCancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(cancelled?.status||'').toUpperCase());
     if(!stopCancelled){const verify=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(stop.orderId),stopClient);stopCancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(verify?.status||'').toUpperCase());}
    }
   }catch{}
   if(!stopCancelled||!tpCancelled){
    await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,updated_at) VALUES($1,$2,NULL,$3,$4,'RECONCILIATION_REQUIRED',now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,status='RECONCILIATION_REQUIRED',updated_at=now()",[tradeId,String(stop?.orderId||''),stopPrice,takeProfitPrice]);
    await db().query("UPDATE trades SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE id=$1",[tradeId]);
    await audit({userId,action:'PROTECTION_RECONCILIATION_REQUIRED',exchange:x.record.name,symbol:trade.symbol,orderId:String(stop?.orderId||stopClient),source:'DRO_TOOL',result:'Take-profit submission outcome or protective-order cancellation could not be confirmed.',status:'RECONCILIATION_REQUIRED'});
    throw new Error('Take-profit submission outcome or cancellation of one or more protective orders could not be confirmed. One or more orders may remain active; manual reconciliation is required.');
   }
   throw firstError;
  }
 }
 let stopStatus='',tpStatus='',verifiedStop=false,verifiedTp=false;
 try{
  const result=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(stop?.orderId||'')||undefined,stopClient);
  stop={...stop,...result};stopStatus=String(result?.status||result?.orderStatus||'').toUpperCase();verifiedStop=['NEW','PENDING_NEW'].includes(stopStatus);
 }catch{}
 try{
  const result=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(tp?.orderId||'')||undefined,tpClient);
  tp={...tp,...result};tpStatus=String(result?.status||result?.orderStatus||'').toUpperCase();verifiedTp=['NEW','PENDING_NEW'].includes(tpStatus);
 }catch{}
 if(!verifiedStop||!verifiedTp){
  let stopCancelled=!stop?.orderId&&!stopClient,tpCancelled=!tp?.orderId&&!tpClient;
  try{const result=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(stop?.orderId||'')||undefined,stopClient);stopCancelled=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||'').toUpperCase());}catch{}
  if(!stopCancelled){try{const result=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(stop?.orderId||'')||undefined,stopClient);stopCancelled=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||result?.orderStatus||'').toUpperCase());}catch{}}
  try{const result=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(tp?.orderId||'')||undefined,tpClient);tpCancelled=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||'').toUpperCase());}catch{}
  if(!tpCancelled){try{const result=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(tp?.orderId||'')||undefined,tpClient);tpCancelled=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||result?.orderStatus||'').toUpperCase());}catch{}}
  if(!stopCancelled||!tpCancelled){
   await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,updated_at) VALUES($1,$2,$3,$4,$5,'RECONCILIATION_REQUIRED',now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,take_profit_order_id=EXCLUDED.take_profit_order_id,status='RECONCILIATION_REQUIRED',updated_at=now()",[tradeId,String(stop?.orderId||stopClient),String(tp?.orderId||tpClient),stopPrice,takeProfitPrice]);
   await db().query("UPDATE trades SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE id=$1",[tradeId]);
   await audit({userId,action:'PROTECTION_RECONCILIATION_REQUIRED',exchange:x.record.name,symbol:trade.symbol,orderId:String(stop?.orderId||stopClient),source:'DRO_TOOL',result:'Protection orders were not both verified active and cancellation could not be confirmed.',status:'RECONCILIATION_REQUIRED'});
   throw new Error('Protection orders could not both be verified active and cancellation of every possible live order could not be confirmed. Immediate exchange reconciliation is required.');
  }
  throw new Error('Exchange did not confirm both protection orders active. Cancellation was confirmed; no protected state was recorded.');
 }
 try{
 const sp=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,'STOP_LOSS_LIMIT',$5,$6,$7,$8,$9,$10) RETURNING id",[userId,trade.exchange_id,trade.symbol,exitSide,qty,stopPrice,stopClient,String(stop?.orderId||''),stopStatus,stop]);
 const tpOrder=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,'TAKE_PROFIT_LIMIT',$5,$6,$7,$8,$9,$10) RETURNING id",[userId,trade.exchange_id,trade.symbol,exitSide,qty,takeProfitPrice,tpClient,String(tp?.orderId||''),tpStatus,tp]);
 await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5),($6,$2,$7,$8,$9)",[sp.rows[0].id,'CREATED',stopStatus,'PROTECTION_SUBMITTED',stop,tpOrder.rows[0].id,tpStatus,'PROTECTION_SUBMITTED',tp]);
 await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,'PROTECTED',now(),now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,take_profit_order_id=EXCLUDED.take_profit_order_id,stop_price=EXCLUDED.stop_price,take_profit_price=EXCLUDED.take_profit_price,status='PROTECTED',verified_at=now(),updated_at=now()",[tradeId,String(stop.orderId||''),String(tp?.orderId||''),stopPrice,takeProfitPrice]);
 await db().query("UPDATE trades SET stop_price=$1,take_profit_price=$2,state='PROTECTED',updated_at=now() WHERE id=$3",[stopPrice,takeProfitPrice,tradeId]);
 await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason) VALUES($1,$2,$3,$4,$5,$6)",[tradeId,trade.state,'PROTECTED','PROTECTION_PLACED','DRO_TOOL','Stop-loss and take-profit orders submitted']);
 return {mode,protected:true,stop,takeProfit:tp,verified:true};
 }catch(persistError){
  let cleanupConfirmed=true;
  for(const [order,clientId] of [[stop,stopClient],[tp,tpClient]] as any[]){
   let cancelled=false;
   try{const result=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(order?.orderId||'')||undefined,clientId);cancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(result?.status||'').toUpperCase());}catch{}
   if(!cancelled){try{const status=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(order?.orderId||'')||undefined,clientId);cancelled=['CANCELED','CANCELLED','EXPIRED'].includes(String(status?.status||status?.orderStatus||'').toUpperCase());}catch{}}
   if(!cancelled) cleanupConfirmed=false;
  }
  try{
   await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,updated_at) VALUES($1,$2,$3,$4,$5,'RECONCILIATION_REQUIRED',now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,take_profit_order_id=EXCLUDED.take_profit_order_id,status='RECONCILIATION_REQUIRED',updated_at=now()",[tradeId,String(stop?.orderId||''),String(tp?.orderId||''),stopPrice,takeProfitPrice]);
   await db().query("UPDATE trades SET state=$1,updated_at=now() WHERE id=$2",[cleanupConfirmed?'PROTECTION_PENDING':'RECONCILIATION_REQUIRED',tradeId]);
   await audit({userId,action:'PROTECTION_PERSISTENCE_FAILED',exchange:x.record.name,symbol:trade.symbol,orderId:String(stop?.orderId||stopClient),source:'DRO_TOOL',result:cleanupConfirmed?'DB persistence failed; exchange protection cleanup confirmed.':'DB persistence failed and one or more exchange orders may remain active.',status:cleanupConfirmed?'PROTECTION_PENDING':'RECONCILIATION_REQUIRED'});
  }catch{}
  throw new Error(cleanupConfirmed?'Protection orders could not be saved locally; exchange cleanup was attempted and the trade needs reconciliation before retry.':'Protection orders may still be active but local persistence failed. Immediate exchange reconciliation is required; do not retry protection blindly.');
 }
}
export async function executeStopAdjustmentCommand(userId:string,tradeId:string,intent:Extract<TradeIntent,'MOVE_STOP_TO_BREAKEVEN'|'TIGHTEN_STOP'>,requestedStop?:number){
 await ensureExchangeSchema();
 const r=await db().query("SELECT * FROM trades WHERE id=$1 AND user_id=$2 LIMIT 1",[tradeId,userId]);
 if(!r.rows[0]) throw new Error('Trade not found.');
 const trade=r.rows[0]; const risk=await getTradingRisk(userId);
 if(risk.emergency_stop) throw new Error('Emergency stop is active.');
 const adjustmentExchange=await getExchange(userId,String(trade.exchange_id));
 const adjustmentAccountType=String(adjustmentExchange.record.account_type||'SPOT').toUpperCase();
 if(adjustmentAccountType==='FUTURES') throw new Error('Automatic Futures stop adjustment is temporarily blocked until exchange position-size, current-price, and reduce-only verification are wired in. Existing protection was not changed.');
 if(String(trade.side).toUpperCase()!=='BUY') throw new Error('Spot stop adjustment currently supports long BUY positions only.');
 const entry=Number(trade.average_fill_price??trade.submitted_price??trade.planned_entry);
 let current=0;
 try{const ticker=await exchangeManager.ticker(adjustmentExchange.record.name,adjustmentExchange.credentials,String(trade.symbol));current=Number(ticker?.lastPrice??ticker?.price);}catch{throw new Error('Could not fetch a live exchange price; stop adjustment was not submitted.');}
 const oldStop=Number(trade.stop_price);
 if(!Number.isFinite(entry)||entry<=0) throw new Error('Trade has no valid entry price.');
 let stop=intent==='MOVE_STOP_TO_BREAKEVEN'?entry:Number(requestedStop);
 if(!Number.isFinite(stop)||stop<=0) throw new Error('A valid stop price is required.');
 if(intent==='MOVE_STOP_TO_BREAKEVEN'&&Number.isFinite(current)&&current<=entry) throw new Error('Break-even is not allowed while the position is not above entry.');
 if(intent==='TIGHTEN_STOP'){
   if(!Number.isFinite(current)||!Number.isFinite(oldStop)||current<=entry) throw new Error('Tighten stop requires a profitable position with an existing stop.');
   if(stop<=oldStop||stop>=current) throw new Error('Tightened stop must be above the existing stop and below current price.');
 }
 if(stop>=current&&Number.isFinite(current)) throw new Error('Stop must remain below current price.');
 const x=await getExchange(userId,String(trade.exchange_id));
 if(String(x.record.name).toLowerCase()!=='binance'||!x.record.permissions?.trading) throw new Error('Binance trading permission is required.');
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 if(mode==='PAPER') return {mode,simulated:true,stopPrice:stop,verified:true};
 if(mode==='CONFIRM') return {mode,requiresConfirmation:true,stopPrice:stop,verified:false};
 if(mode!=='AUTONOMOUS'||!risk.autonomous_enabled||process.env.FLI_LIVE_TRADING_ENABLED!=='true') throw new Error('Live protection adjustment is not enabled.');
 const p=await db().query("SELECT * FROM trade_protection WHERE trade_id=$1 LIMIT 1",[tradeId]);
 const protection=p.rows[0];
 const qty=openPositionQuantity(trade);
 if(qty<=0) throw new Error('No protected quantity is available.');
 if(protection?.stop_order_id){
  let cancelConfirmed=false;
  try{const result=await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(protection.stop_order_id));cancelConfirmed=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||'').toUpperCase());}catch{}
  if(!cancelConfirmed){try{const result=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(protection.stop_order_id));cancelConfirmed=['CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'].includes(String(result?.status||result?.orderStatus||'').toUpperCase());}catch{}}
  if(!cancelConfirmed) throw new Error('Existing stop cancellation could not be confirmed. No replacement was submitted and the old order reference was preserved for reconciliation.');
 }
 await db().query("UPDATE trades SET state='PROTECTION_PENDING',updated_at=now() WHERE id=$1 AND state NOT IN ('CLOSED','CANCELED','CANCELLED','FAILED','REJECTED')",[tradeId]);
 const cid='FLI_SL_'+crypto.randomBytes(10).toString('hex');
 let order:any;
 try{order=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'STOP_LOSS_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(stop),stopPrice:String(stop),newOrderRespType:'FULL',clientOrderId:cid});}
 catch(e){
  let restored:any=null;
  const restoreClient='FLI_SL_RESTORE_'+crypto.randomBytes(8).toString('hex');
  if(Number.isFinite(oldStop)&&oldStop>0&&Number.isFinite(current)&&oldStop<current&&qty>0){
   try{
    const candidate=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'STOP_LOSS_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(oldStop),stopPrice:String(oldStop),newOrderRespType:'FULL',clientOrderId:restoreClient});
    const status=String(candidate?.status||'').toUpperCase();
    if((status==='NEW'||status==='PENDING_NEW')&&candidate?.orderId) restored=candidate;
    else if(candidate?.orderId){const verified=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,String(candidate.orderId),restoreClient);if(['NEW','PENDING_NEW'].includes(String(verified?.status||verified?.orderStatus||'').toUpperCase())) restored={...candidate,...verified};}
   }catch{}
  }
  if(restored){
   await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,'SELL','STOP_LOSS_LIMIT',$4,$5,$6,$7,'NEW',$8) ON CONFLICT(exchange_id,client_order_id) DO NOTHING",[userId,trade.exchange_id,trade.symbol,qty,oldStop,restoreClient,String(restored.orderId),restored]);
   await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,'PROTECTED',now(),now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,stop_price=EXCLUDED.stop_price,status='PROTECTED',verified_at=now(),updated_at=now()",[tradeId,String(restored.orderId),protection?.take_profit_order_id||null,oldStop,trade.take_profit_price??null]);
   await db().query("UPDATE trades SET stop_price=$1,state='PROTECTED',updated_at=now() WHERE id=$2",[oldStop,tradeId]);
   return {mode,failed:true,restoredPreviousStop:true,stopPrice:oldStop,error:e instanceof Error?e.message:'Stop replacement failed'};
  }
  await db().query("UPDATE trade_protection SET status='RECONCILIATION_REQUIRED',updated_at=now() WHERE trade_id=$1",[tradeId]);
  await db().query("UPDATE trades SET state='RECONCILIATION_REQUIRED',updated_at=now() WHERE id=$1 AND state NOT IN ('CLOSED','CANCELED','CANCELLED','FAILED','REJECTED')",[tradeId]);
  await audit({userId,action:'STOP_ADJUSTMENT_RECONCILIATION_REQUIRED',exchange:x.record.name,symbol:trade.symbol,orderId:cid,source:'DRO_TOOL',result:'Replacement stop failed and previous stop restoration was not confirmed.',status:'RECONCILIATION_REQUIRED'});
  return {mode,failed:true,unprotected:true,reconciliationRequired:true,previousStop:oldStop,stopPrice:stop,error:e instanceof Error?e.message:'Stop replacement and rollback failed'};
 }
 let stopStatus=String(order?.status||'').toUpperCase(); const stopOrderId=String(order?.orderId||'');
 if(!stopStatus && stopOrderId){
  try{
   const verified=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,stopOrderId,cid);
   stopStatus=String(verified?.status||verified?.orderStatus||'').toUpperCase();
   if(verified?.status) order={...order,...verified};
  }catch{}
 }
 const verifiedStop=stopStatus==='NEW'||stopStatus==='PENDING_NEW';
 if(!verifiedStop){
  try{if(stopOrderId)await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,stopOrderId,cid);}catch{}
  await db().query("UPDATE trade_protection SET status='RECONCILIATION_REQUIRED',updated_at=now() WHERE trade_id=$1",[tradeId]);
  await db().query("UPDATE trades SET state='PROTECTION_PENDING',updated_at=now() WHERE id=$1 AND state NOT IN ('CLOSED','CANCELED','CANCELLED','FAILED','REJECTED')",[tradeId]);
  throw new Error('Exchange did not confirm the replacement stop as active; trade remains unprotected.');
 }
 const stopDb=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,'SELL','STOP_LOSS_LIMIT',$4,$5,$6,$7,$8,$9) RETURNING id",[userId,trade.exchange_id,trade.symbol,qty,stop,cid,stopOrderId,stopStatus,order]);
 await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[stopDb.rows[0].id,'CREATED',stopStatus,'PROTECTION_ADJUSTED',order]);
 await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,'PROTECTED',now(),now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,stop_price=EXCLUDED.stop_price,status='PROTECTED',verified_at=now(),updated_at=now()",[tradeId,stopOrderId,protection?.take_profit_order_id||null,stop,trade.take_profit_price??null]);
 await db().query("UPDATE trades SET stop_price=$1,state=CASE WHEN state IN ('CLOSING','CLOSED') THEN state ELSE 'PROTECTED' END,updated_at=now() WHERE id=$2",[stop,tradeId]);
 await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,trade.state,'PROTECTED',intent,'DRO_TOOL','Stop adjusted',order]);
 return {mode,adjusted:true,stopPrice:stop,order,verified:true};
}

export async function executeCloseCommand(userId:string,tradeId:string,intent:TradeIntent,quantityPct=100){
 await ensureExchangeSchema();
 const t=await db().query("SELECT * FROM trades WHERE id=$1 AND user_id=$2 LIMIT 1",[tradeId,userId]);
 if(!t.rows[0]) throw new Error('Trade not found.');
 const trade=t.rows[0];
 const risk=await getTradingRisk(userId);
 if(risk.emergency_stop) throw new Error('Emergency stop is active.');
 if(!['CLOSE_POSITION','PARTIAL_CLOSE'].includes(intent)) throw new Error('This executor only handles position-close commands.');
 const pct=Math.min(100,Math.max(1,Number(quantityPct)||100));
 const x=await getExchange(userId,String(trade.exchange_id));
 if(String(x.record.name).toLowerCase()!=='binance') throw new Error('Command execution currently supports Binance.');
 if(!x.record.permissions?.trading) throw new Error('Trading permission is disabled on this API key.');
 const accountType=String(x.record.account_type||'SPOT').toUpperCase();
 let closeSide:'BUY'|'SELL'='SELL';
 let available=0;
 if(accountType==='FUTURES'){
   const result=await exchangeManager.positions(x.record.name,x.credentials);
   const positions=Array.isArray(result?.positions)?result.positions:[];
   const matching=positions.filter((v:any)=>String(v?.symbol||'').toUpperCase()===String(trade.symbol).toUpperCase()&&Math.abs(Number(v?.positionAmt)||0)>0);
   if(matching.length>1) throw new Error('Multiple Futures positions exist for this symbol (likely Hedge mode). Automatic close is blocked until positionSide-aware execution is supported.');
   const actual=matching[0]; const amount=Number(actual?.positionAmt||0);
   if(!actual||!Number.isFinite(amount)||amount===0) throw new Error('No open Futures position exists on the exchange.');
   const positionSide=amount<0?'SELL':'BUY';
   if(String(trade.side||'').toUpperCase()!==positionSide) throw new Error('The exchange position direction does not match this trade record; reconciliation is required before closing.');
   closeSide=amount<0?'BUY':'SELL';
   available=Math.abs(amount);
 }else{
   const base=String(trade.symbol).replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
   if(!base||base===trade.symbol) throw new Error('Unsupported quote asset for automatic spot close.');
   const balances=await exchangeManager.balance(x.record.name,x.credentials);
   const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===base):null;
   available=Number(row?.free||0);
 }
 const positionQty=openPositionQuantity(trade);
 const rawQty=Math.min(available,positionQty)*(pct/100);
 let qty=rawQty;
 if(accountType==='FUTURES'){
   const markets=await exchangeManager.markets(x.record.name,x.credentials);
   const market=(Array.isArray(markets?.symbols)?markets.symbols:[]).find((v:any)=>String(v?.symbol||'').toUpperCase()===String(trade.symbol).toUpperCase());
   const filters=Array.isArray(market?.filters)?market.filters:[];
   const step=Number(filters.find((v:any)=>v?.filterType==='MARKET_LOT_SIZE'&&Number(v?.stepSize)>0)?.stepSize||filters.find((v:any)=>v?.filterType==='LOT_SIZE'&&Number(v?.stepSize)>0)?.stepSize||0);
   if(step>0) qty=Math.floor((rawQty+Number.EPSILON)/step)*step;
   qty=Number(qty.toPrecision(12));
 }
 if(!Number.isFinite(qty)||qty<=0) throw new Error('No valid close quantity is available for this position.');
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 const clientOrderId='FLI_CMD_'+crypto.randomBytes(12).toString('hex');
 const intentData={symbol:trade.symbol,side:closeSide,type:'MARKET',quantity:qty,quantityPct:pct,accountType,reduceOnly:accountType==='FUTURES',clientOrderId};
 if(mode==='PAPER'){
   await db().query("UPDATE trade_commands SET status='SIMULATED',updated_at=now() WHERE trade_id=$1 AND user_id=$2 AND status='RECEIVED' AND intent=$3",[tradeId,userId,intent]);
   return {mode,simulated:true,action:intent,intent:intentData,verified:true};
 }
 if(mode==='CONFIRM') return {mode,requiresConfirmation:true,action:intent,intent:intentData,verified:false};
 if(mode!=='AUTONOMOUS') throw new Error('Invalid execution mode.');
 if(!risk.autonomous_enabled) throw new Error('AUTONOMOUS mode is disabled in risk settings.');
 if(process.env.FLI_LIVE_TRADING_ENABLED!=='true') throw new Error('Live execution is locked by the server.');
 const result=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:closeSide,type:'MARKET',quantity:String(qty),...(accountType==='FUTURES'?{reduceOnly:true}:{}),newOrderRespType:'FULL',clientOrderId});
 const remoteId=String(result.orderId||'');
 let status=String(result.status||'').toUpperCase();
 if(!status&&remoteId){
  try{
   const verified=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,remoteId,clientOrderId);
   status=String(verified?.status||verified?.orderStatus||'').toUpperCase();
  }catch{}
 }
 if(['REJECTED','CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH'].includes(status)){
  await audit({userId,action:intent,exchange:x.record.name,symbol:trade.symbol,orderId:remoteId||clientOrderId,source:'DRO_COMMAND',result:'Exchange rejected close order',status});
  throw new Error('Exchange rejected the close order ('+status+').');
 }
 if(!status) status='ACKNOWLEDGED';
 const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[userId,trade.exchange_id,trade.symbol,closeSide,'MARKET',qty,Number(result.avgPrice||result.price)||null,clientOrderId,remoteId,status,result]);
 await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',status,'COMMAND_CLOSE_SUBMITTED',result]);
 const closeTradeId=await createTradeForOrder({userId,exchangeId:String(trade.exchange_id),orderId:inserted.rows[0].id,exchangeOrderId:remoteId,clientOrderId,symbol:trade.symbol,side:closeSide,executionMode:mode,quantity:qty,parentTradeId:tradeId});
 const parentNextState=pct>=100?'CLOSING':String(trade.state||'FILLED');
 if(pct>=100) await db().query("UPDATE trades SET state='CLOSING',exit_reason=$1,updated_at=now() WHERE id=$2",[intent,tradeId]);
 await db().query("UPDATE trade_commands SET status='SUBMITTED',updated_at=now() WHERE trade_id=$1 AND user_id=$2 AND status='RECEIVED' AND intent=$3",[tradeId,userId,intent]);
 await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,trade.state,parentNextState,'COMMAND_EXECUTED','DRO_TOOL','Natural-language close command',result]);
 let verification:any=null;
 try{verification=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,remoteId,clientOrderId);await reconcileOrderLifecycle(userId,String(trade.exchange_id),trade.symbol);}catch{}
 await audit({userId,action:intent,exchange:x.record.name,symbol:trade.symbol,orderId:remoteId||clientOrderId,source:'DRO_COMMAND',result:'Command submitted; verification attempted',status});
 return {mode,action:intent,intent:intentData,order:result,tradeId,closeTradeId,verification,verified:Boolean(verification?.status)};
}
