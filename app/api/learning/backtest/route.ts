import {NextResponse} from 'next/server';
import {runBacktest,validateLearningResult,type LearningCandle} from '@/lib/learning-lab';
export async function POST(req:Request){
 try{
  const body=await req.json();
  const candles=Array.isArray(body?.candles)?body.candles.map((c:any)=>({timestamp:Number(c.timestamp),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)})):[] as LearningCandle[];
  if(candles.length<30)return NextResponse.json({ok:false,error:'At least 30 candles are required.'},{status:400});
  const signals=Array.isArray(body?.signals)?body.signals.map((s:any)=>({index:Number(s.index),direction:s.direction==='SHORT'?'SHORT':'LONG',confidence:Number(s.confidence)||0,horizonBars:Number(s.horizonBars)||1})): [];
  const result=runBacktest({candles,signals,feeBps:Number(body?.feeBps??10),slippageBps:Number(body?.slippageBps??5)});
  return NextResponse.json({ok:true,result,evaluation:validateLearningResult(result)});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Invalid backtest request'},{status:400});}
}
