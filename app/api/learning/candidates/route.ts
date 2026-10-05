import {NextResponse} from 'next/server';
import {runBacktest,runForwardTest,validateLearningResult} from '@/lib/learning-lab';
import {createCandidate,listCandidates,evaluateCandidate,promoteCandidate,rollbackCandidate,getCandidate,compareCandidates,attachForwardMetrics} from '@/lib/strategy-evolution';

export async function GET(){try{return NextResponse.json({ok:true,candidates:await listCandidates()});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Candidate list failed'},{status:500});}}
export async function POST(req:Request){
 try{
  const body=await req.json(); const action=String(body?.action||'create');
  if(action==='create'){
   if(!body?.backtest?.candles||!Array.isArray(body.backtest.candles)||!Array.isArray(body.backtest.signals))return NextResponse.json({ok:false,error:'Server-side backtest input is required.'},{status:400});
   const result=runBacktest(body.backtest); const validation=validateLearningResult(result);
   if(!validation.eligible)return NextResponse.json({ok:false,error:'Backtest did not pass the baseline learning gate.',result,validation},{status:422});
   const candidate=await createCandidate(String(body?.parentVersion||'v-current'),result,String(body?.reason||'Validated backtest candidate'));
   return NextResponse.json({ok:true,candidate,backtest:result,validation});
  }
  if(action==='forward-test'){
   const id=String(body?.id||'');
   if(!body?.backtest?.candles||!Array.isArray(body.backtest.candles)||!Array.isArray(body.backtest.signals))return NextResponse.json({ok:false,error:'Forward-test candles and signals are required.'},{status:400});
   const result=runForwardTest(body.backtest,Number(body?.trainRatio||0.7));
   const candidate=await attachForwardMetrics(id,result);
   return NextResponse.json({ok:true,candidate,forwardTest:result,validation:validateLearningResult(result)});
  }
  const id=String(body?.id||''); const c=await getCandidate(id); if(!c)return NextResponse.json({ok:false,error:'Candidate not found'},{status:404});
  if(action==='promote')return NextResponse.json({ok:true,candidate:await promoteCandidate(c.id)});
  if(action==='evaluate')return NextResponse.json({ok:true,evaluation:evaluateCandidate(c)});
  if(action==='compare'){const other=String(body?.otherId||'');return NextResponse.json({ok:true,comparison:await compareCandidates(c.id,other)});}
  if(action==='rollback')return NextResponse.json({ok:true,candidate:await rollbackCandidate(c.id)});
  return NextResponse.json({ok:false,error:'Unsupported action'},{status:400});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Candidate operation failed'},{status:400});}
}
