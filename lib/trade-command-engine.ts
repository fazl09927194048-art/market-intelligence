import crypto from 'node:crypto';
import {db,ensureExchangeSchema,getExchange,getTradingRisk,audit} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';
import {createTradeForOrder,reconcileOrderLifecycle} from '@/lib/trade-lifecycle';

export type TradeIntent='CLOSE_POSITION'|'PARTIAL_CLOSE'|'MOVE_STOP_TO_BREAKEVEN'|'TIGHTEN_STOP'|'MONITOR_ONLY'|'CONDITIONAL_CLOSE'|'UNKNOWN';

export function parseTradeIntent(input:string){
 const text=String(input||'').trim().toLowerCase();
 if(!text)return {intent:'UNKNOWN' as TradeIntent,confidence:0,needsClarification:true,reason:'Empty command.'};
 if(/نصف|half|50\s*%/.test(text)&&/(ببند|بستن|close|ببندش)/.test(text))return {intent:'PARTIAL_CLOSE' as TradeIntent,quantityPct:50,confidence:.98,needsClarification:false};
 if(/سر.?استاپ|استاپ.*ورود|break.?even|breakeven/.test(text))return {intent:'MOVE_STOP_TO_BREAKEVEN' as TradeIntent,confidence:.95,needsClarification:false};
 if(/استاپ.*نزدیک|tighten.*stop/.test(text))return {intent:'TIGHTEN_STOP' as TradeIntent,confidence:.92,needsClarification:false};
 if(/فقط.*مانیتور|مانیتور.*کن|دست نزن|monitor only/.test(text))return {intent:'MONITOR_ONLY' as TradeIntent,confidence:.95,needsClarification:false};
 if(/اگر.*ضرر.*بیشتر|در صورت.*ضرر|conditional.*close/.test(text))return {intent:'CONDITIONAL_CLOSE' as TradeIntent,confidence:.9,needsClarification:false};
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
 const r=await db().query(`INSERT INTO trade_commands(trade_id,user_id,intent,payload,status,idempotency_key) VALUES($1,$2,$3,$4,'RECEIVED',$5) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET updated_at=now() RETURNING id,status,trade_id,intent,payload,idempotency_key`,[tradeId||null,userId,intent,payload,idempotencyKey]);
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
 if(String(trade.side).toUpperCase()!=='BUY') throw new Error('Spot protection currently requires a long BUY position.');
 const qty=Number(trade.remaining_quantity||trade.filled_quantity||trade.original_quantity||0);
 if(!Number.isFinite(qty)||qty<=0) throw new Error('No protected position quantity is available.');
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 const payload={tradeId,symbol:trade.symbol,quantity:qty,stopPrice,takeProfitPrice};
 if(mode==='PAPER') return {mode,simulated:true,verified:true,payload};
 if(mode==='CONFIRM') return {mode,requiresConfirmation:true,verified:false,payload};
 if(mode!=='AUTONOMOUS'||!risk.autonomous_enabled||process.env.FLI_LIVE_TRADING_ENABLED!=='true') throw new Error('Live protection is not enabled by the current execution policy.');
 const stopClient='FLI_SL_'+crypto.randomBytes(10).toString('hex'), tpClient='FLI_TP_'+crypto.randomBytes(10).toString('hex');
 let stop:any;
 try{stop=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'STOP_LOSS_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(stopPrice),stopPrice:String(stopPrice),newOrderRespType:'FULL',clientOrderId:stopClient});}
 catch(firstError){
  try{stop=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,undefined,stopClient);}catch{throw firstError;}
 }
 let tp:any=null;
 try{tp=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'TAKE_PROFIT_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(takeProfitPrice),stopPrice:String(takeProfitPrice),newOrderRespType:'FULL',clientOrderId:tpClient});}
 catch(firstError){try{tp=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,undefined,tpClient);}catch{try{if(stop?.orderId) await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(stop.orderId),stopClient);}catch{} throw firstError;}}
 const stopStatus=String(stop?.status||'ACKNOWLEDGED').toUpperCase(), tpStatus=String(tp?.status||'ACKNOWLEDGED').toUpperCase();
 const sp=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,'SELL','STOP_LOSS_LIMIT',$4,$5,$6,$7,$8,$9) RETURNING id",[userId,trade.exchange_id,trade.symbol,qty,stopPrice,stopClient,String(stop?.orderId||''),stopStatus,stop]);
 const tpOrder=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,'SELL','TAKE_PROFIT_LIMIT',$4,$5,$6,$7,$8,$9) RETURNING id",[userId,trade.exchange_id,trade.symbol,qty,takeProfitPrice,tpClient,String(tp?.orderId||''),tpStatus,tp]);
 await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5),($6,$2,$7,$8,$9)",[sp.rows[0].id,'CREATED',stopStatus,'PROTECTION_SUBMITTED',stop,tpOrder.rows[0].id,tpStatus,'PROTECTION_SUBMITTED',tp]);
 await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,'PROTECTED',now(),now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,take_profit_order_id=EXCLUDED.take_profit_order_id,stop_price=EXCLUDED.stop_price,take_profit_price=EXCLUDED.take_profit_price,status='PROTECTED',verified_at=now(),updated_at=now()",[tradeId,String(stop.orderId||''),String(tp?.orderId||''),stopPrice,takeProfitPrice]);
 await db().query("UPDATE trades SET stop_price=$1,take_profit_price=$2,state='PROTECTED',updated_at=now() WHERE id=$3",[stopPrice,takeProfitPrice,tradeId]);
 await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason) VALUES($1,$2,$3,$4,$5,$6)",[tradeId,trade.state,'PROTECTED','PROTECTION_PLACED','DRO_TOOL','Stop-loss and take-profit orders submitted']);
 return {mode,protected:true,stop,takeProfit:tp,verified:true};
}
export async function executeStopAdjustmentCommand(userId:string,tradeId:string,intent:Extract<TradeIntent,'MOVE_STOP_TO_BREAKEVEN'|'TIGHTEN_STOP'>,requestedStop?:number){
 await ensureExchangeSchema();
 const r=await db().query("SELECT * FROM trades WHERE id=$1 AND user_id=$2 LIMIT 1",[tradeId,userId]);
 if(!r.rows[0]) throw new Error('Trade not found.');
 const trade=r.rows[0]; const risk=await getTradingRisk(userId);
 if(risk.emergency_stop) throw new Error('Emergency stop is active.');
 if(String(trade.side).toUpperCase()!=='BUY') throw new Error('Spot stop adjustment currently supports long BUY positions only.');
 const entry=Number(trade.average_fill_price??trade.submitted_price??trade.planned_entry);
 const current=Number(trade.current_price); const oldStop=Number(trade.stop_price);
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
 const qty=Number(trade.remaining_quantity||trade.filled_quantity||trade.original_quantity||0);
 if(qty<=0) throw new Error('No protected quantity is available.');
 if(protection?.stop_order_id){try{await exchangeManager.cancel(x.record.name,x.credentials,trade.symbol,String(protection.stop_order_id));}catch(e){throw new Error('Existing stop could not be cancelled safely; no replacement was submitted.');}}
 const cid='FLI_SL_'+crypto.randomBytes(10).toString('hex');
 let order:any;
 try{order=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'STOP_LOSS_LIMIT',timeInForce:'GTC',quantity:String(qty),price:String(stop),stopPrice:String(stop),newOrderRespType:'FULL',clientOrderId:cid});}
 catch(e){return {mode,failed:true,previousStop:oldStop,stopPrice:stop,error:e instanceof Error?e.message:'Stop replacement failed'};}
 await db().query("INSERT INTO trade_protection(trade_id,stop_order_id,take_profit_order_id,stop_price,take_profit_price,status,verified_at,updated_at) VALUES($1,$2,$3,$4,$5,'PROTECTED',now(),now()) ON CONFLICT(trade_id) DO UPDATE SET stop_order_id=EXCLUDED.stop_order_id,stop_price=EXCLUDED.stop_price,status='PROTECTED',verified_at=now(),updated_at=now()",[tradeId,String(order.orderId||''),protection?.take_profit_order_id||null,stop,trade.take_profit_price??null]);
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
 const base=String(trade.symbol).replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
 if(!base||base===trade.symbol) throw new Error('Unsupported quote asset for automatic spot close.');
 const balances=await exchangeManager.balance(x.record.name,x.credentials);
 const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===base):null;
 const available=Number(row?.free||0);
 const qty=Math.floor(available*(pct/100)*1e8)/1e8;
 if(!Number.isFinite(qty)||qty<=0) throw new Error('No available spot balance for this close command.');
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 const clientOrderId='FLI_CMD_'+crypto.randomBytes(12).toString('hex');
 const intentData={symbol:trade.symbol,side:'SELL',type:'MARKET',quantity:qty,quantityPct:pct,clientOrderId};
 if(mode==='PAPER'){
   await db().query("UPDATE trade_commands SET status='SIMULATED',updated_at=now() WHERE trade_id=$1 AND user_id=$2 AND status='RECEIVED' AND intent=$3",[tradeId,userId,intent]);
   return {mode,simulated:true,action:intent,intent:intentData,verified:true};
 }
 if(mode==='CONFIRM') return {mode,requiresConfirmation:true,action:intent,intent:intentData,verified:false};
 if(mode!=='AUTONOMOUS') throw new Error('Invalid execution mode.');
 if(!risk.autonomous_enabled) throw new Error('AUTONOMOUS mode is disabled in risk settings.');
 if(process.env.FLI_LIVE_TRADING_ENABLED!=='true') throw new Error('Live execution is locked by the server.');
 const result=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol:trade.symbol,side:'SELL',type:'MARKET',quantity:String(qty),newOrderRespType:'FULL',clientOrderId});
 const remoteId=String(result.orderId||'');
 const status=String(result.status||'ACKNOWLEDGED').toUpperCase();
 const inserted=await db().query("INSERT INTO orders(user_id,exchange_id,symbol,side,type,quantity,price,client_order_id,exchange_order_id,status,raw) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[userId,trade.exchange_id,trade.symbol,'SELL','MARKET',qty,Number(result.avgPrice||result.price)||null,clientOrderId,remoteId,status,result]);
 await db().query("INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,'CREATED',status,'COMMAND_CLOSE_SUBMITTED',result]);
 const closeTradeId=await createTradeForOrder({userId,exchangeId:String(trade.exchange_id),orderId:inserted.rows[0].id,exchangeOrderId:remoteId,clientOrderId,symbol:trade.symbol,side:'SELL',executionMode:mode,quantity:qty});
 await db().query("UPDATE trades SET state='CLOSING',exit_reason=$1,updated_at=now() WHERE id=$2",[intent,tradeId]);
 await db().query("UPDATE trade_commands SET status='SUBMITTED',updated_at=now() WHERE trade_id=$1 AND user_id=$2 AND status='RECEIVED' AND intent=$3",[tradeId,userId,intent]);
 await db().query("INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)",[tradeId,trade.state,'CLOSING','COMMAND_EXECUTED','DRO_TOOL','Natural-language close command',result]);
 let verification:any=null;
 try{verification=await exchangeManager.status(x.record.name,x.credentials,trade.symbol,remoteId,clientOrderId);await reconcileOrderLifecycle(userId,String(trade.exchange_id),trade.symbol);}catch{}
 await audit({userId,action:intent,exchange:x.record.name,symbol:trade.symbol,orderId:remoteId||clientOrderId,source:'DRO_COMMAND',result:'Command submitted; verification attempted',status});
 return {mode,action:intent,intent:intentData,order:result,tradeId,closeTradeId,verification,verified:Boolean(verification?.status)};
}
