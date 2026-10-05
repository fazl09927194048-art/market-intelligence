import {NextResponse} from 'next/server';
import {runLearningCycle} from '@/lib/learning-orchestrator';
export async function POST(req:Request){
 try{
  const body=await req.json().catch(()=>({}));
  const limit=Math.max(1,Math.min(100,Number(body?.limit)||25));
  return NextResponse.json({ok:true,...await runLearningCycle(limit)});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Learning cycle failed'},{status:500});}
}
