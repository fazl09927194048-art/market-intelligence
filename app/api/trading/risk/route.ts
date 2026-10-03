import {NextRequest,NextResponse} from 'next/server';
import {getSessionUserId} from '@/lib/exchange/session';
import {audit,getTradingRisk,setTradingRisk} from '@/lib/exchange/db';
export const dynamic='force-dynamic';
export async function GET(){try{return NextResponse.json({ok:true,risk:await getTradingRisk(await getSessionUserId())},{headers:{'Cache-Control':'no-store'}})}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Risk unavailable'},{status:500})}}
export async function POST(req:NextRequest){try{const userId=await getSessionUserId();const body=await req.json();const risk=await setTradingRisk(userId,body||{});await audit({userId,action:'UPDATE_RISK_SETTINGS',source:'SETTINGS',result:'Updated',status:'OK'});return NextResponse.json({ok:true,risk})}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Invalid risk settings'},{status:400})}}
