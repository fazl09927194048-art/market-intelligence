import {NextResponse} from 'next/server';
import {createCandidate,listCandidates,evaluateCandidate,promoteCandidate,rollbackCandidate} from '@/lib/strategy-evolution';

export async function GET(){return NextResponse.json({ok:true,candidates:listCandidates()});}
export async function POST(req:Request){
 try{
  const body=await req.json(); const action=String(body?.action||'create');
  if(action==='create')return NextResponse.json({ok:true,candidate:createCandidate(String(body?.parentVersion||'v-current'),body?.metrics, String(body?.reason||'Backtest candidate'))});
  if(action==='evaluate'||action==='promote'){
   const c=listCandidates().find(x=>x.id===String(body?.id)); if(!c)return NextResponse.json({ok:false,error:'Candidate not found'},{status:404});
   if(action==='promote')return NextResponse.json({ok:true,candidate:promoteCandidate(c.id)});
   return NextResponse.json({ok:true,evaluation:evaluateCandidate(c)});
  }
  if(action==='rollback')return NextResponse.json({ok:true,candidate:rollbackCandidate(String(body?.id))});
  return NextResponse.json({ok:false,error:'Unsupported action'},{status:400});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Candidate operation failed'},{status:400});}
}
