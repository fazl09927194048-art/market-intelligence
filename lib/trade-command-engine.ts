import {db,ensureExchangeSchema} from '@/lib/exchange/db';

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
