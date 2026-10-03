import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {getExchange,getTradingRisk,audit} from '@/lib/exchange/db';
import {exchangeManager} from '@/lib/exchange/manager';

export const dynamic='force-dynamic';

function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0}

export async function POST(req:NextRequest){
 try{
  const userId=await getSessionUserId();
  const b=await req.json();
  const exchangeId=String(b.exchangeId||'');
  const symbol=String(b.symbol||'').toUpperCase();
  if(!exchangeId||!/^[A-Z0-9]{2,20}$/.test(symbol)) return NextResponse.json({ok:false,error:'exchangeId and symbol are required.'},{status:400});
  const risk=await getTradingRisk(userId);
  if(risk.emergency_stop) return NextResponse.json({ok:false,error:'Emergency stop is active.'},{status:423});
  const x=await getExchange(userId,exchangeId);
  if(x.record.name!=='binance') return NextResponse.json({ok:false,error:'Close-position execution is currently implemented for Binance.'},{status:501});
  if(!x.record.permissions?.trading) return NextResponse.json({ok:false,error:'Trading permission is disabled on this API key.'},{status:403});
  if(risk.execution_mode==='AUTONOMOUS' && process.env.FLI_LIVE_TRADING_ENABLED!=='true') return NextResponse.json({ok:false,error:'Live execution is locked by the server.'},{status:403});

  const baseAsset=symbol.replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
  if(!baseAsset||baseAsset===symbol) return NextResponse.json({ok:false,error:'Unsupported quote asset for automatic spot close.'},{status:400});
  const balances=await exchangeManager.getBalance(x.record.name,x.credentials);
  const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===baseAsset):null;
  const available=n(row?.free);
  if(available<=0) return NextResponse.json({ok:false,error:'No available spot balance to close for '+symbol+'.'},{status:409});

  const result=await exchangeManager.createOrder(x.record.name,x.credentials,{
    symbol,side:'SELL',type:'MARKET',quantity:available.toString(),
    newOrderRespType:'FULL',
  });
  await audit({userId,action:'CLOSE_POSITION',exchange:x.record.name,symbol,source:'DRO_TOOL',result:'Position close submitted',status:String(result.status||'ACKNOWLEDGED')});
  return NextResponse.json({ok:true,action:'CLOSE_POSITION',symbol,side:'SELL',quantity:available,order:result,reason:String(b.reason||'DRO user command')});
 }catch(e){
  return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Close position failed'},{status:502});
 }
}