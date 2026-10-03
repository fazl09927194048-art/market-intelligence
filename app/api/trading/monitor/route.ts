import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {getExchange,listExchanges} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  let exchangeId=req.nextUrl.searchParams.get('exchangeId')||'';
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  if(!exchangeId){const xs=await listExchanges(userId);if(xs.length!==1)return NextResponse.json({ok:false,error:'Select exchangeId when multiple exchanges are connected.'},{status:409});exchangeId=String(xs[0].id)}
  const x=await getExchange(userId,exchangeId);
  if(x.record.name!=='binance') return NextResponse.json({ok:false,error:'Monitoring is currently implemented for Binance.'},{status:501});
  const [ticker,orders]=await Promise.all([exchangeManager.ticker(x.record.name,x.credentials,symbol),exchangeManager.history(x.record.name,x.credentials,symbol,100)]);
  const rows=Array.isArray(orders)?orders.filter((o:any)=>String(o.status).toUpperCase()==='FILLED'):[];
  let qty=0,cost=0;
  for(const o of rows){
   const q=Number(o.executedQty||o.origQty||0), quote=Number(o.cummulativeQuoteQty||0);
   if(!Number.isFinite(q)||q<=0)continue;
   if(String(o.side).toUpperCase()==='BUY'){qty+=q;cost+=quote}
   if(String(o.side).toUpperCase()==='SELL'){qty-=q;cost-=quote}
  }
  const price=Number(ticker?.lastPrice||ticker?.price||0);
  if(qty<=0||!Number.isFinite(price)) return NextResponse.json({ok:true,hasPosition:false,symbol,price});
  const avgEntry=cost/qty,pnl=qty*price-cost,pnlPct=cost?((price-avgEntry)/avgEntry)*100:0;
  const alert=pnlPct>=1?'PROFIT':pnlPct<=-1?'LOSS':'NORMAL'; const action=pnlPct>=3?'TAKE_PROFIT_REVIEW':pnlPct<=-2?'RISK_REVIEW':'HOLD'; return NextResponse.json({ok:true,hasPosition:true,symbol,price,quantity:qty,avgEntry,pnl,pnlPct,alert,action,notification:alert==='PROFIT'?`Position is in profit (${pnlPct.toFixed(2)}%). DRO recommends reviewing profit protection.`:alert==='LOSS'?`Position is in loss (${pnlPct.toFixed(2)}%). DRO recommends reviewing risk and invalidation.`:`Position is near neutral (${pnlPct.toFixed(2)}%).`,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Monitor failed'},{status:502})}
}