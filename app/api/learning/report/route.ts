import {NextResponse} from 'next/server';
import {buildLearningReport} from '@/lib/learning-report';
export async function GET(){try{return NextResponse.json({ok:true,report:await buildLearningReport()});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Learning report failed'},{status:500});}}
