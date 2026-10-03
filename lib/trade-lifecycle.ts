import {db,ensureExchangeSchema,getExchange,audit} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';

const TERMINAL=new Set(['FILLED','CANCELED','CANCELLED','REJECTED','EXPIRED','EXPIRED_IN_MATCH']);
const STATE_RANK:Record<string,number>={CREATED:0,VALIDATING:1,APPROVED:2,SUBMITTING:3,ACKNOWLEDGED:4,PARTIALLY_FILLED:5,FILLED:6,PROTECTION_PENDING:7,PROTECTED:8,MONITORING:9,ADJUSTING:10,CLOSING:11,CLOSED:12,REJECTED:99,CANCELLED:99,CANCELED:99,EXPIRED:99,FAILED:99,UNKNOWN:98,RECONCILIATION_REQUIRED:97,EMERGENCY_CLOSED:99};

export type LifecycleSync={checked:number;updated:number;events:number;open:number;terminal:number;errors:string[];checkedAt:string};

function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:undefined}
function normalizeRemoteStatus(v:unknown, fallback:string){const s=String(v||fallback).toUpperCase();if(s==='CANCELLED')return 'CANCELLED';if(s==='CANCELED')return 'CANCELED';if(s==='PARTIALLY_FILLED')return 'PARTIALLY_FILLED';if(s==='NEW'||s==='PENDING_NEW'||s==='ACKNOWLEDGED')return 'ACKNOWLEDGED';if(s==='FILLED')return 'FILLED';if(s==='REJECTED')return 'REJECTED';if(s==='EXPIRED'||s==='EXPIRED_IN_MATCH')return s;return s||fallback}
function lifecycleState(orderStatus:string,tradeState:string,executed:number,requested:number){
 const s=normalizeRemoteStatus(orderStatus,tradeState);
 if(s==='FILLED')return tradeState==='CLOSING'?'CLOSING':'FILLED';
 if(s==='PARTIALLY_FILLED'||(requested>0&&executed>0&&executed<requested))return 'PARTIALLY_FILLED';
 if(['REJECTED','CANCELED','CANCELLED','EXPIRED','EXPIRED_IN_MATCH'].includes(s))return s;
 if(tradeState==='CLOSING')return 'CLOSING';
 if(['PROTECTED','MONITORING','ADJUSTING'].includes(tradeState))return tradeState;
 return s==='ACKNOWLEDGED'?'ACKNOWLEDGED':tradeState||'UNKNOWN';
}
function validTransition(previous:string,next:string){
 if(previous===next)return true;
 if(STATE_RANK[previous]===undefined||STATE_RANK[next]===undefined)return false;
 if(next==='RECONCILIATION_REQUIRED'||next==='UNKNOWN')return true;
 if(STATE_RANK[previous]>=90)return false;
 if(next==='PARTIALLY_FILLED'&&previous==='FILLED')return false;
 if(next==='CLOSED'&&previous!=='CLOSING')return false;
 return STATE_RANK[next]>=STATE_RANK[previous]||next==='CLOSING';
}

export async function reconcileOrderLifecycle(userId:string,exchangeId:string,symbol?:string):Promise<LifecycleSync>{
 await ensureExchangeSchema();
 const x=await getExchange(userId,exchangeId);
 const params:any[]=[userId,exchangeId];
 let where='o.user_id=$1 AND o.exchange_id=$2';
 if(symbol){params.push(symbol.toUpperCase());where+=' AND o.symbol=$3';}
 const rows=await db().query(`SELECT o.id,o.symbol,o.client_order_id,o.exchange_order_id,o.status,o.quantity,o.raw,t.id AS trade_id,t.state AS trade_state,t.filled_quantity,t.remaining_quantity FROM orders o LEFT JOIN trades t ON t.order_id=o.id WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,params);
 let updated=0,events=0,open=0,terminal=0; const errors:string[]=[];
 for(const row of rows.rows){
  try{
   const remote=await exchangeManager.status(x.record.name,x.credentials,row.symbol,row.exchange_order_id||undefined,row.client_order_id||undefined);
   const remoteStatus=normalizeRemoteStatus(remote?.status||remote?.orderStatus,row.status);
   const executed=num(remote?.executedQty??remote?.executedQuantity??remote?.filledQuantity)??num(row.filled_quantity)??0;
   const requested=num(row.quantity)??0;
   const nextOrder=remoteStatus;
   const currentOrder=String(row.status||'UNKNOWN').toUpperCase();
   if(nextOrder!==currentOrder){
    await db().query('UPDATE orders SET status=$1,raw=$2,updated_at=now() WHERE id=$3',[nextOrder,remote,row.id]);
    await db().query('INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)',[row.id,currentOrder,nextOrder,'LIFECYCLE_RECONCILIATION',remote]);
    updated++;events++;
   }
   if(row.trade_id){
    const tradeState=String(row.trade_state||'UNKNOWN').toUpperCase();
    let nextTrade=lifecycleState(nextOrder,tradeState,executed,requested);
    if(nextOrder==='FILLED'&&tradeState==='CLOSING') nextTrade='CLOSING';
    if(!validTransition(tradeState,nextTrade)) nextTrade='RECONCILIATION_REQUIRED';
    const avg=num(remote?.avgPrice??remote?.averageFillPrice??remote?.price);
    const last=num(remote?.lastFillPrice??remote?.price);
    const fee=num(remote?.commission??remote?.fees);
    const remaining=Math.max(0,requested-executed);
    await db().query(`UPDATE trades SET state=$1,filled_quantity=$2,remaining_quantity=$3,average_fill_price=COALESCE($4,average_fill_price),last_fill_price=COALESCE($5,last_fill_price),fees=COALESCE($6,fees),submitted_at=COALESCE(submitted_at,created_at),first_fill_at=CASE WHEN $2>0 AND first_fill_at IS NULL THEN now() ELSE first_fill_at END,filled_at=CASE WHEN $1='FILLED' THEN COALESCE(filled_at,now()) ELSE filled_at END,updated_at=now() WHERE id=$7`,[nextTrade,executed,remaining,avg,last,fee,row.trade_id]);
    if(nextTrade!==tradeState){
     await db().query('INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason,raw) VALUES($1,$2,$3,$4,$5,$6,$7)',[row.trade_id,tradeState,nextTrade,'EXCHANGE_RECONCILIATION','system','Remote exchange state synchronized',remote]);
     events++;
    }
   }
   if(TERMINAL.has(nextOrder))terminal++;else open++;
  }catch(e){
   errors.push(`${row.symbol}:${e instanceof Error?e.message:'status check failed'}`);
   if(row.trade_id){
    try{
     const current=String(row.trade_state||'UNKNOWN').toUpperCase();
     if(current!=='CLOSED'&&current!=='REJECTED'&&current!=='CANCELED'&&current!=='CANCELLED'){
      await db().query('UPDATE trades SET state=$1,updated_at=now() WHERE id=$2',['RECONCILIATION_REQUIRED',row.trade_id]);
      await db().query('INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason) VALUES($1,$2,$3,$4,$5,$6)',[row.trade_id,current,'RECONCILIATION_REQUIRED','EXCHANGE_RECONCILIATION_FAILED','system',e instanceof Error?e.message:'status check failed']);
     }
    }catch{}
   }
  }
 }
 return{checked:rows.rows.length,updated,events,open,terminal,errors,checkedAt:new Date().toISOString()};
}

export async function createTradeForOrder(input:{userId:string;exchangeId:string;orderId:string;exchangeOrderId?:string;clientOrderId?:string;symbol:string;side:string;executionMode:string;cycleId?:string;strategyVersion?:string;droVersion?:string;decisionTraceId?:string;plannedEntry?:number;quantity?:number;stopPrice?:number;takeProfitPrice?:number;plannedHorizonMinutes?:number}){
 await ensureExchangeSchema();
 const r=await db().query(`INSERT INTO trades(user_id,exchange_id,symbol,side,execution_mode,order_id,exchange_order_id,client_order_id,cycle_id,strategy_version,dro_version,decision_trace_id,planned_entry,original_quantity,remaining_quantity,stop_price,take_profit_price,planned_horizon_minutes,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,'CREATED') RETURNING id`,[input.userId,input.exchangeId,input.symbol,input.side,input.executionMode,input.orderId,input.exchangeOrderId||null,input.clientOrderId||null,input.cycleId||null,input.strategyVersion||null,input.droVersion||null,input.decisionTraceId||null,input.plannedEntry??null,input.quantity??0,input.stopPrice??null,input.takeProfitPrice??null,input.plannedHorizonMinutes??null]);
 const tradeId=r.rows[0].id;
 await db().query('INSERT INTO trade_events(trade_id,previous_state,new_state,event,actor,reason) VALUES($1,$2,$3,$4,$5,$6)',[tradeId,'','CREATED','TRADE_CREATED','system','Order linked to lifecycle']);
 return tradeId;
}
