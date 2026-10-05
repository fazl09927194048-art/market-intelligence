import {NextResponse} from 'next/server';
import {listPersistedStrategyVersions} from '@/lib/strategy-version-store';
export async function GET(){try{return NextResponse.json({ok:true,versions:await listPersistedStrategyVersions()});}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Version store unavailable'},{status:500});}}
