import { NextResponse } from 'next/server';
import { evaluateDueForecasts } from '@/lib/forecast-snapshots';
import { recordForecastEvaluation } from '@/lib/forecast-evaluation';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!process.env.DATABASE_URL)return NextResponse.json({enabled:false,evaluated:0});const body=await request.json().catch(()=>({}));const limit=Math.min(Math.max(Number(body?.limit)||25,1),100);const evaluations=await evaluateDueForecasts(limit);let persisted=0;for(const evaluation of evaluations)if(await recordForecastEvaluation(evaluation))persisted++;return NextResponse.json({enabled:true,evaluated:evaluations.length,persisted,results:evaluations});}
