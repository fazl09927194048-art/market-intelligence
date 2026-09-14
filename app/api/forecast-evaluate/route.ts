import { NextResponse } from 'next/server';
import { evaluateDueForecasts } from '@/lib/forecast-snapshots';
import { recordForecastEvaluation } from '@/lib/forecast-evaluation';

export const dynamic='force-dynamic';

function authorized(request:Request){
  const expected=process.env.FORECAST_EVALUATION_TOKEN||process.env.CRON_SECRET;
  if(!expected)return process.env.NODE_ENV!=='production';
  const header=request.headers.get('authorization')||'';
  return header===`Bearer ${expected}`||request.headers.get('x-forecast-evaluation-token')===expected;
}

export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!process.env.DATABASE_URL)return NextResponse.json({enabled:false,evaluated:0,persisted:0},{headers:{'Cache-Control':'no-store'}});
  const body=await request.json().catch(()=>({}));
  const limit=Math.min(Math.max(Number(body?.limit)||25,1),100);
  const evaluations=await evaluateDueForecasts(limit);
  let persisted=0;
  for(const evaluation of evaluations)if(await recordForecastEvaluation(evaluation))persisted++;
  return NextResponse.json({enabled:true,evaluated:evaluations.length,persisted,results:evaluations},{headers:{'Cache-Control':'no-store'}});
}
