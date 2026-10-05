import { db, ensureExchangeSchema } from '@/lib/exchange/db';

type ExitDecision={tradeId:string;action:'HOLD'|'REVIEW'|'CLOSE'|'PROTECT';reason:string;confidence:number;context:any};
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:undefined};

export async function evaluateTradeExits(userId:string,exchangeId:string,symbol?:string):Promise<{checked:number;decisions:ExitDecision[]}>{
 await ensureExchangeSchema();
 const args:any[]=[userId,exchangeId];
 let where="user_id=$1 AND exchange_id=$2 AND state NOT IN ('CLOSED','REJECTED','CANCELED','CANCELLED','EXPIRED','FAILED','EMERGENCY_CLOSED')";
 if(symbol){args.push(symbol.toUpperCase());where+=" AND symbol=$3";}
 const r=await db().query("SELECT id,symbol,side,state,average_fill_price,current_price,unrealized_pnl,unrealized_pnl_pct,stop_price,take_profit_price,planned_horizon_minutes,created_at,thesis_status,risk_level FROM trades WHERE "+where+" ORDER BY created_at DESC LIMIT 100",args);
 const decisions:ExitDecision[]=[];
 const conditions=await db().query("SELECT id,trade_id,payload FROM trade_commands WHERE user_id=$1 AND intent='CONDITIONAL_CLOSE' AND status IN ('RECEIVED','ARMED')",[userId]);
 const conditionByTrade=new Map<string,any[]>();
 for(const row of conditions.rows){const list=conditionByTrade.get(String(row.trade_id))||[];list.push({...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload});conditionByTrade.set(String(row.trade_id),list);}
 for(const t of r.rows){
  const pct=n(t.unrealized_pnl_pct)??0, entry=n(t.average_fill_price), price=n(t.current_price);
  const ageMin=Math.max(0,(Date.now()-new Date(t.created_at).getTime())/60000);
  const horizon=n(t.planned_horizon_minutes);
  let action:'HOLD'|'REVIEW'|'CLOSE'|'PROTECT'='HOLD',reason='Trade remains within current thesis.',confidence=55;
  const armed=conditionByTrade.get(String(t.id))||[];
  const triggered=armed.find((q:any)=>{const v=n(q.payload?.conditionValue); const type=String(q.payload?.conditionType||''); return v!==undefined && ((type==='LOSS_PCT'&&pct<=-Math.abs(v))||(type==='PROFIT_PCT'&&pct>=Math.abs(v)))});
  if(triggered){action='CLOSE';reason=`Armed conditional close triggered at ${pct.toFixed(2)}% P/L.`;confidence=96; await db().query("UPDATE trade_commands SET status='TRIGGERED',updated_at=now() WHERE id=$1",[triggered.id]);}
  else if(t.state==='RECONCILIATION_REQUIRED'){action='REVIEW';reason='Exchange state could not be reconciled; verify execution before new action.';confidence=98}
  else if(t.thesis_status==='INVALIDATED'){action='CLOSE';reason='Trade thesis is marked invalidated.';confidence=95}
  else if(entry&&price&&t.stop_price&&((String(t.side).toUpperCase()==='BUY'&&price<=Number(t.stop_price))||(String(t.side).toUpperCase()==='SELL'&&price>=Number(t.stop_price)))){action='CLOSE';reason='Price reached the recorded protective stop level.';confidence=99}
  else if(entry&&price&&t.take_profit_price&&((String(t.side).toUpperCase()==='BUY'&&price>=Number(t.take_profit_price))||(String(t.side).toUpperCase()==='SELL'&&price<=Number(t.take_profit_price)))){action='CLOSE';reason='Price reached the recorded take-profit level.';confidence=99}
  else if(horizon&&ageMin>horizon*1.5){action='REVIEW';reason='Trade exceeded its planned horizon; reassess regime, liquidity and thesis.';confidence=82}
  else if(pct<=-3){action='REVIEW';reason='Material drawdown requires a fresh thesis, liquidity and protection review; no blind exit is forced.';confidence=88}
  else if(pct>=3&&t.take_profit_price==null){action='PROTECT';reason='Profitable trade has no recorded take-profit; review protection instead of assuming an exit.';confidence=80}
  decisions.push({tradeId:String(t.id),action,reason,confidence,context:{pnlPct:pct,ageMin,thesis:t.thesis_status,risk:t.risk_level}});
  if(action!=='HOLD'){
   const dedupe=`EXIT_ENGINE:${t.id}:${action}:${Math.floor(pct)}`;
   await db().query("INSERT INTO trade_alerts(trade_id,user_id,alert_type,severity,message,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,dedupe_key) DO NOTHING",[t.id,userId,'EXIT_ENGINE',confidence>=90?'CRITICAL':'WARNING',reason,dedupe]);
  }
 }
 return {checked:r.rows.length,decisions};
}