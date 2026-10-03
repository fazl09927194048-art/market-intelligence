import {db,ensureExchangeSchema,getExchange,audit} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';

const TERMINAL=new Set(['FILLED','CANCELED','CANCELLED','REJECTED','EXPIRED','EXPIRED_IN_MATCH']);

export type LifecycleSync={checked:number;updated:number;events:number;open:number;terminal:number;errors:string[];checkedAt:string};

export async function reconcileOrderLifecycle(userId:string,exchangeId:string,symbol?:string):Promise<LifecycleSync>{
 await ensureExchangeSchema();
 const x=await getExchange(userId,exchangeId);
 const params:any[]=[userId,exchangeId];
 let where='user_id=$1 AND exchange_id=$2';
 if(symbol){params.push(symbol.toUpperCase());where+=' AND symbol=$3';}
 const rows=await db().query(`SELECT id,symbol,client_order_id,exchange_order_id,status FROM orders WHERE ${where} ORDER BY created_at DESC LIMIT 50`,params);
 let updated=0,events=0,open=0,terminal=0; const errors:string[]=[];
 for(const row of rows.rows){
  const current=String(row.status||'').toUpperCase();
  if(TERMINAL.has(current)){terminal++;continue;}
  try{
   const remote=await exchangeManager.status(x.record.name,x.credentials,row.symbol,row.exchange_order_id||undefined,row.client_order_id||undefined);
   const next=String(remote?.status||remote?.orderStatus||current).toUpperCase();
   if(!next){open++;continue;}
   if(next!==current){
    await db().query('UPDATE orders SET status=$1,raw=$2,updated_at=now() WHERE id=$3',[next,remote,row.id]);
    await db().query('INSERT INTO order_events(order_id,from_status,to_status,event,raw) VALUES($1,$2,$3,$4,$5)',[row.id,current,next,'LIFECYCLE_RECONCILIATION',remote]);
    updated++;events++;
    await audit({userId,action:'ORDER_STATUS_SYNC',exchange:x.record.name,symbol:row.symbol,orderId:row.exchange_order_id||row.client_order_id,source:'LIFECYCLE_MANAGER',result:next,status:next});
   }
   if(TERMINAL.has(next))terminal++;else open++;
  }catch(e){errors.push(`${row.symbol}:${e instanceof Error?e.message:'status check failed'}`);}
 }
 return{checked:rows.rows.length,updated,events,open,terminal,errors,checkedAt:new Date().toISOString()};
}
